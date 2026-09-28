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
