if (typeof window.showPythonProgress !== "function") {
    window.showPythonProgress = message => {
        const status = document.createElement("div");
        status.className = "python-progress visible";
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        status.innerHTML = `<div class="python-progress-message"></div><div class="python-progress-track"><div class="python-progress-bar"></div></div>`;
        status.querySelector(".python-progress-message").textContent = message || "Python is working…";
        document.body.appendChild(status);
        return () => status.remove();
    };
}

function requestDeletionPassword() {
    const dialog = document.createElement("dialog");
    dialog.className = "deletion-password-dialog";
    dialog.innerHTML = `
        <form>
            <label for="deletion-password">Enter the info-section password to confirm deletion:</label>
            <input id="deletion-password" type="password" autocomplete="current-password" required>
            <div class="deletion-password-actions">
                <button type="button" data-cancel>Cancel</button>
                <button type="submit">Continue</button>
            </div>
        </form>
    `;
    document.body.appendChild(dialog);

    return new Promise(resolve => {
        const input = dialog.querySelector("input");
        const finish = value => {
            dialog.close();
            dialog.remove();
            resolve(value);
        };

        dialog.querySelector("form").addEventListener("submit", event => {
            event.preventDefault();
            finish(input.value);
        });
        dialog.querySelector("[data-cancel]").addEventListener("click", () => finish(null));
        dialog.addEventListener("cancel", event => {
            event.preventDefault();
            finish(null);
        });

        dialog.showModal();
        input.focus();
    });
}

document.querySelectorAll(".model-instance-update-button").forEach(updateButton => {
    let actions = updateButton.closest(".model-instance-actions");
    if (!actions) {
        actions = document.createElement("span");
        actions.className = "model-instance-actions";
        updateButton.before(actions);
        actions.append(updateButton);
    }

    if (!actions.querySelector(".model-instance-delete-button")) {
        const deleteButton = document.createElement("button");
        deleteButton.className = "model-instance-delete-button";
        deleteButton.type = "button";
        deleteButton.dataset.objectType = updateButton.dataset.objectType;
        deleteButton.dataset.objectId = updateButton.dataset.objectId;
        deleteButton.textContent = "Delete";
        actions.insertBefore(deleteButton, updateButton);
    }
});

document.querySelectorAll(".model-instance-update-button").forEach(button => {
    button.addEventListener("click", async () => {
        button.disabled = true;
        const originalText = button.textContent;
        button.textContent = "Updating…";
        const hideProgress = window.showPythonProgress("Updating item…");

        try {
            const response = await fetch("/api/update-instance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    objectType: button.dataset.objectType,
                    objectId: button.dataset.objectId,
                    progressId: hideProgress.progressId,
                }),
            });
            const result = await response.json();
            if (!response.ok || !result.ok) {
                throw new Error(result.error || "Model update failed.");
            }
            window.location.reload();
        } catch (error) {
            alert(error.message || "Model update failed.");
            button.disabled = false;
            button.textContent = originalText;
        } finally {
            hideProgress();
        }
    });
});

function requestClassificationPassword() {
    const dialog = document.createElement("dialog");
    dialog.className = "deletion-password-dialog";
    dialog.innerHTML = `
        <form>
            <label for="classification-password">Enter the info-section password to reassign classification:</label>
            <input id="classification-password" type="password" autocomplete="current-password" required>
            <div class="deletion-password-actions">
                <button type="button" data-cancel>Cancel</button>
                <button type="submit">Continue</button>
            </div>
        </form>
    `;
    document.body.appendChild(dialog);

    return new Promise(resolve => {
        const input = dialog.querySelector("input");
        const finish = value => {
            dialog.close();
            dialog.remove();
            resolve(value);
        };
        dialog.querySelector("form").addEventListener("submit", event => {
            event.preventDefault();
            finish(input.value);
        });
        dialog.querySelector("[data-cancel]").addEventListener("click", () => finish(null));
        dialog.addEventListener("cancel", event => {
            event.preventDefault();
            finish(null);
        });
        dialog.showModal();
        input.focus();
    });
}

document.querySelectorAll("[data-classification-dialog]").forEach(dialog => {
    const input = dialog.querySelector("[data-classification-code]");
    const message = dialog.querySelector("[data-classification-message]");
    const openButton = document.querySelector("[data-classification-open]");
    const reassignButton = dialog.querySelector("[data-classification-reassign]");
    const autoButton = dialog.querySelector("[data-classification-auto]");
    const cancelButton = dialog.querySelector("[data-classification-cancel]");

    openButton?.addEventListener("click", () => {
        message.textContent = "";
        dialog.showModal();
        input.focus();
        input.select();
    });
    cancelButton?.addEventListener("click", () => dialog.close());
    input?.addEventListener("input", () => {
        input.value = input.value.replace(/\D/g, "").slice(0, 4);
        message.textContent = "";
    });

    async function submitClassification(action) {
        const classificationCode = input.value.trim();
        if (action === "reassign" && !/^\d{4}$/.test(classificationCode)) {
            message.textContent = "Enter a 4-digit classification code.";
            input.focus();
            return;
        }

        const password = await requestClassificationPassword();
        if (password === null) return;
        if (!password) {
            message.textContent = "Enter the password to continue.";
            return;
        }

        reassignButton.disabled = true;
        autoButton.disabled = true;
        message.textContent = action === "auto" ? "Automatically classifying…" : "Checking classification…";
        const hideProgress = window.showPythonProgress("Updating classification and related models…");
        try {
            const passwordResponse = await fetch("/api/check-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            });
            if (!passwordResponse.ok) {
                throw new Error(await passwordResponse.text());
            }
            const { token } = await passwordResponse.json();
            const response = await fetch("/api/reassign-classification", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    objectType: dialog.dataset.objectType,
                    objectId: dialog.dataset.objectId,
                    action,
                    classificationCode,
                    token,
                    progressId: hideProgress.progressId,
                }),
            });
            const result = await response.json();
            if (!response.ok || !result.ok) {
                throw new Error(result.error || "Classification update failed.");
            }
            dialog.close();
            window.location.reload();
        } catch (error) {
            message.textContent = error.message || "Classification update failed.";
        } finally {
            reassignButton.disabled = false;
            autoButton.disabled = false;
            hideProgress();
        }
    }

    reassignButton?.addEventListener("click", () => submitClassification("reassign"));
    autoButton?.addEventListener("click", () => submitClassification("auto"));
});

const deleteConsequences = {
    Profile: "This also deletes the profile's segment files and segment news, but keeps the profile's own news.",
    Segment: "This deletes the segment's files and news.",
    Component: "This deletes the component's files and news, but keeps its listed company profiles and segments.",
    ValueChain: "This deletes the value chain's files and news, but keeps its member components and value chains.",
};

document.querySelectorAll(".model-instance-delete-button").forEach(button => {
    button.addEventListener("click", async () => {
        const objectType = button.dataset.objectType;
        const objectId = button.dataset.objectId;
        const consequence = deleteConsequences[objectType];
        if (!consequence || !window.confirm(`Permanently delete ${objectType} ${objectId}?\n\n${consequence}`)) {
            return;
        }

        const password = await requestDeletionPassword();
        if (password === null) return;
        if (!password) {
            alert("Enter password.");
            return;
        }

        button.disabled = true;
        const originalText = button.textContent;
        button.textContent = "Deleting…";
        const hideProgress = window.showPythonProgress("Deleting item…");

        try {
            const passwordResponse = await fetch("/api/check-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            });
            if (!passwordResponse.ok) {
                throw new Error(await passwordResponse.text());
            }
            const { token } = await passwordResponse.json();

            const response = await fetch("/api/delete-instance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    objectType,
                    objectId,
                    token,
                    progressId: hideProgress.progressId,
                }),
            });
            const result = await response.json();
            if (!response.ok || !result.ok) {
                throw new Error(result.error || "Model deletion failed.");
            }
            window.location.href = "/";
        } catch (error) {
            alert(error.message || "Model deletion failed.");
            button.disabled = false;
            button.textContent = originalText;
        } finally {
            hideProgress();
        }
    });
});
