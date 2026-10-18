const { spawn } = require("child_process");
const { StringDecoder } = require("string_decoder");

const progressTasks = new Map();

function startProgressTask(progressId) {
    if (typeof progressId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(progressId)) {
        return null;
    }

    const now = Date.now();
    for (const [id, task] of progressTasks) {
        if (task.finishedAt && now - task.finishedAt > 5 * 60 * 1000) {
            progressTasks.delete(id);
        }
    }
    while (progressTasks.size >= 100) {
        const oldestFinished = [...progressTasks].find(([, task]) => task.finishedAt);
        if (!oldestFinished) break;
        progressTasks.delete(oldestFinished[0]);
    }

    const task = { lines: [], next: 0, done: false, finishedAt: null };
    progressTasks.set(progressId, task);
    return task;
}

function getPythonProgress(progressId, after = 0) {
    const task = progressTasks.get(progressId);
    if (!task) return null;
    return {
        lines: task.lines.filter(line => line.index >= after),
        next: task.next,
        done: task.done,
    };
}

function runPython(python, script, input, label = "Python task") {
    return new Promise((resolve, reject) => {
        const progressTask = startProgressTask(input?.progressId);
        const child = spawn(
            python,
            [script],
            {
                stdio: ["pipe", "pipe", "pipe", "pipe"],
                // Node sends JSON as UTF-8; make Python decode it the same way
                // on Windows, where the locale encoding may be a legacy code page.
                env: {
                    ...process.env,
                    PYTHONIOENCODING: "utf-8",
                    PYTHONUNBUFFERED: "1",
                },
            }
        );

        let response = "";
        let settled = false;

        const attachOutput = (stream, target) => {
            const decoder = new StringDecoder("utf8");
            let pending = "";
            const recordLines = text => {
                pending += text;
                const lines = pending.split(/\r\n|\n|\r/);
                pending = lines.pop();
                for (const line of lines) {
                    if (progressTask) {
                        progressTask.lines.push({ index: progressTask.next++, stream, line });
                        if (progressTask.lines.length > 1000) progressTask.lines.shift();
                    }
                }
            };

            target.on("data", data => {
                (stream === "stderr" ? process.stderr : process.stdout).write(data);
                recordLines(decoder.write(data));
            });
            target.on("end", () => {
                recordLines(decoder.end());
                if (pending && progressTask) {
                    progressTask.lines.push({ index: progressTask.next++, stream, line: pending });
                    if (progressTask.lines.length > 1000) progressTask.lines.shift();
                }
            });
        };

        attachOutput("stdout", child.stdout);
        attachOutput("stderr", child.stderr);

        const fail = error => {
            if (settled) return;
            settled = true;
            if (progressTask) {
                progressTask.done = true;
                progressTask.finishedAt = Date.now();
            }
            reject(error);
        };

        child.stdio[3].on("data", data => {
            response += data.toString();
        });

        child.on("error", error => {
            error.kind = "spawn";
            fail(error);
        });
        child.stdin.on("error", error => {
            error.kind = "stdin";
            fail(error);
        });
        child.on("close", code => {
            if (settled) return;
            if (progressTask) {
                progressTask.done = true;
                progressTask.finishedAt = Date.now();
            }

            let result;
            try {
                result = JSON.parse(response);
            } catch (error) {
                error.kind = "invalid-response";
                error.message = `Invalid response from ${label}.`;
                error.response = response;
                fail(error);
                return;
            }

            settled = true;
            resolve({ code, result });
        });

        child.stdin.end(JSON.stringify(input));
    });
}

module.exports = { runPython, getPythonProgress };
