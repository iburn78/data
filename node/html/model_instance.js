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

        try {
            const response = await fetch("/api/update-instance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    objectType: button.dataset.objectType,
                    objectId: button.dataset.objectId,
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
        }
    });
});

const deleteConsequences = {
    Profile: "This also deletes the profile's segment files and segment news, but keeps the profile's own news.",
    Segment: "This deletes the segment's files and news.",
    Component: "This deletes the component's files and news, but keeps its member profiles and segments.",
    ValueChain: "This deletes the value chain's files and news, but keeps its components.",
};

document.querySelectorAll(".model-instance-delete-button").forEach(button => {
    button.addEventListener("click", async () => {
        const objectType = button.dataset.objectType;
        const objectId = button.dataset.objectId;
        const consequence = deleteConsequences[objectType];
        if (!consequence || !window.confirm(`Permanently delete ${objectType} ${objectId}?\n\n${consequence}`)) {
            return;
        }

        button.disabled = true;
        const originalText = button.textContent;
        button.textContent = "Deleting…";

        try {
            const response = await fetch("/api/delete-instance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ objectType, objectId }),
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
        }
    });
});
