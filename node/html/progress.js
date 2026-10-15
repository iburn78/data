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
        document.body.appendChild(status);
        return status;
    }

    window.showPythonProgress = message => {
        const element = getStatus();
        activeOperations += 1;
        element.querySelector(".python-progress-message").textContent =
            message || "Python is working…";
        element.classList.add("visible");

        let finished = false;
        return () => {
            if (finished) return;
            finished = true;
            activeOperations = Math.max(0, activeOperations - 1);
            if (activeOperations === 0) element.classList.remove("visible");
        };
    };
})();
