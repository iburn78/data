(() => {
    let activeOperations = 0;
    let status;

    function getStatus() {
        if (status) return status;

        status = document.createElement("div");
        status.className = "python-progress";
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");

        const message = document.createElement("div");
        message.className = "python-progress-message";
        status.appendChild(message);

        const track = document.createElement("div");
        track.className = "python-progress-track";
        const bar = document.createElement("div");
        bar.className = "python-progress-bar";
        track.appendChild(bar);
        status.appendChild(track);

        const output = document.createElement("div");
        output.className = "python-progress-output";
        output.setAttribute("aria-label", "Python output");
        status.appendChild(output);
        document.body.appendChild(status);
        return status;
    }

    window.showPythonProgress = message => {
        const element = getStatus();
        const output = element.querySelector(".python-progress-output");
        if (activeOperations === 0) output.replaceChildren();
        activeOperations += 1;
        element.querySelector(".python-progress-message").textContent =
            message || "Python is working…";
        element.classList.add("visible");

        const progressId = globalThis.crypto?.randomUUID?.()
            || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        let cursor = 0;
        let polling = true;
        let timer;
        let wakePolling;

        const appendOutput = result => {
            for (const entry of result.lines || []) {
                if (Number.isInteger(entry.index) && entry.index < cursor) continue;
                if (entry.stream === "stdout" && entry.line.trim()) {
                    element.querySelector(".python-progress-message").textContent = entry.line;
                }
                const line = document.createElement("div");
                line.className = `python-progress-line${entry.stream === "stderr" ? " error" : ""}`;
                line.textContent = entry.line;
                output.appendChild(line);
                while (output.childElementCount > 300) output.firstElementChild.remove();
            }
            cursor = Math.max(cursor, result.next ?? cursor);
            output.scrollTop = output.scrollHeight;
        };

        const poll = async () => {
            while (polling) {
                try {
                    const response = await fetch(
                        `/api/python-progress/${encodeURIComponent(progressId)}?after=${cursor}`
                    );
                    if (response.ok) {
                        const result = await response.json();
                        appendOutput(result);
                        if (result.done) break;
                    }
                } catch (error) {
                    // The task request remains authoritative if progress polling fails.
                }
                await new Promise(resolve => {
                    wakePolling = resolve;
                    timer = setTimeout(resolve, 300);
                });
                wakePolling = null;
            }
        };
        poll();

        let finished = false;
        const hideProgress = () => {
            if (finished) return;
            finished = true;
            polling = false;
            clearTimeout(timer);
            wakePolling?.();
            fetch(`/api/python-progress/${encodeURIComponent(progressId)}?after=${cursor}`)
                .then(response => response.ok ? response.json() : null)
                .then(result => {
                    if (result) appendOutput(result);
                })
                .catch(() => {})
                .finally(() => {
                    activeOperations = Math.max(0, activeOperations - 1);
                    if (activeOperations === 0) element.classList.remove("visible");
                });
        };
        hideProgress.progressId = progressId;
        return hideProgress;
    };
})();
