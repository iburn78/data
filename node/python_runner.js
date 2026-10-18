const { spawn } = require("child_process");

function runPython(python, script, input, label = "Python task") {
    return new Promise((resolve, reject) => {
        const child = spawn(
            python,
            [script],
            {
                stdio: ["pipe", "pipe", "pipe", "pipe"],
                // Node sends JSON as UTF-8; make Python decode it the same way
                // on Windows, where the locale encoding may be a legacy code page.
                env: { ...process.env, PYTHONIOENCODING: "utf-8" },
            }
        );

        let response = "";
        let settled = false;

        const fail = error => {
            if (settled) return;
            settled = true;
            reject(error);
        };

        child.stdout.on("data", data => process.stdout.write(data));
        child.stderr.on("data", data => process.stderr.write(data));
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

module.exports = { runPython };
