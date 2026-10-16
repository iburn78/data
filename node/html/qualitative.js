function enterEditMode(card) {
    const passwordInput = card.querySelector(".edit-password");
    const password = passwordInput.value;

    if (!password) {
        alert("Enter password.");
        return;
    }

    const sectionName = card.dataset.section;

    fetch("/api/check-password", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            password: password
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error("Incorrect password.");
        }

        return response.json();
    })
    .then(data => {
        card.dataset.editToken = data.token;
        createEditor(card, sectionName);
    })
    .catch(error => {
        alert(error.message);
    });
}


function createEditor(card, sectionName) {

    const content = card.querySelector(".qualitative-content");

    /*
     * Save the current HTML so Cancel can restore it.
     */
    card.dataset.originalContent = content.innerHTML;

    /*
     * The server already rendered the current values.
     * Extract them from the existing table.
     */
    const values = {};

    content.querySelectorAll(
        ".qualitative-table > tbody > tr"
    ).forEach(row => {

        const label = row.querySelector("th");

        if (!label) {
            return;
        }

        const key = label.textContent.trim();

        /*
         * reviewed is read from the badge.
         */
        if (key === "reviewed") {
            const status = row.querySelector(".reviewed-status");
            values[key] =
                status.classList.contains("reviewed");
            return;
        }

        const booleanInput = row.querySelector(".qualitative-checkbox");
        if (booleanInput) {
            values[key] = booleanInput.checked;
            return;
        }

        /*
         * Lists are represented by nested tables.
         */
        const nestedTable =
            row.querySelector("td > .qualitative-table");

        if (nestedTable) {
            values[key] = [];

            nestedTable.querySelectorAll("tbody > tr")
                .forEach(itemRow => {
                    values[key].push(
                        itemRow.textContent.trim()
                    );
                });

            return;
        }

        /*
         * Scalar
         */
        const td = row.querySelector("td");

        values[key] = td
            ? td.textContent.trim()
            : "";
    });

    renderEditor(card, values);
}


function renderEditor(card, values) {

    const content = card.querySelector(".qualitative-content");

    const editor = document.createElement("div");
    editor.className = "info-edit";

    for (const [key, value] of Object.entries(values)) {
        if (key === "updated") {
            continue;
        }

        const row = document.createElement("div");
        row.className = "edit-row";

        const label = document.createElement("div");
        label.className = "edit-label";
        label.dataset.fieldKey = key;
        label.textContent = key === "tags"
            ? "#tags (t)"
            : key === "notes"
                ? "notes (n)"
                : key;

        const valueDiv = document.createElement("div");
        valueDiv.className = "edit-value";

        /*
         * reviewed
         */
        if (key === "reviewed") {

            const checkbox = document.createElement("input");

            checkbox.type = "checkbox";
            checkbox.className = "edit-reviewed";
            checkbox.checked = value;

            const text = document.createElement("span");
            text.textContent = value
                ? " Reviewed (v)"
                : " Not reviewed (v)";

            checkbox.addEventListener("change", () => {
                text.textContent = checkbox.checked
                    ? " Reviewed (v)"
                    : " Not reviewed (v)";
            });

            valueDiv.appendChild(checkbox);
            valueDiv.appendChild(text);
        }

        /* Boolean fields such as create_segments */
        else if (typeof value === "boolean") {
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "edit-boolean";
            checkbox.checked = value;
            valueDiv.appendChild(checkbox);

            if (key === "create_segments") {
                const shortcut = document.createElement("span");
                shortcut.textContent = " (s)";
                valueDiv.appendChild(shortcut);
            }
        }

        /*
         * List
         */
        else if (Array.isArray(value)) {

            const list = document.createElement("div");
            list.className = "edit-list";

            value.forEach(item => {
                addListItem(list, item);
            });

            const addButton =
                document.createElement("button");

            addButton.type = "button";
            addButton.className = "add-item-button";
            addButton.textContent = "+ Add";

            addButton.addEventListener("click", () => {
                addListItem(list, "");
            });

            valueDiv.appendChild(list);
            valueDiv.appendChild(addButton);
        }

        /*
         * Scalar
         */
        else {

            const input = document.createElement("input");

            input.type = "text";
            input.className = "edit-scalar";
            input.value = value ?? "";

            valueDiv.appendChild(input);
        }

        row.appendChild(label);
        row.appendChild(valueDiv);

        editor.appendChild(row);
    }

    const cancelButton =
        document.createElement("button");

    cancelButton.type = "button";
    cancelButton.className = "cancel-button";
    cancelButton.textContent = "Cancel (^c)";

    cancelButton.addEventListener("click", () => {
        exitEditMode(card, false);
    });

    const acceptButton =
        document.createElement("button");

    acceptButton.type = "button";
    acceptButton.className = "accept-button";
    acceptButton.textContent = "Accept";

    acceptButton.addEventListener("click", () => {
        saveEdit(card);
    });

    content.replaceChildren(editor);

    /*
     * Replace password/edit controls.
     */
    const actions = card.querySelector(".qualitative-actions");
    card.dataset.originalActions = actions.innerHTML;

    actions.replaceChildren(
        cancelButton.cloneNode(true),
        acceptButton.cloneNode(true)
    );

    /*
     * Reattach listeners to the cloned buttons.
     */
    const buttons = actions.querySelectorAll("button");

    buttons[0].addEventListener("click", () => {
        exitEditMode(card, false);
    });

    buttons[1].addEventListener("click", () => {
        saveEdit(card);
    });
}


function addListItem(list, value) {

    const item = document.createElement("div");
    item.className = "edit-list-item";

    const input = document.createElement("input");

    input.type = "text";
    input.value = value;

    item.appendChild(input);
    list.appendChild(item);
}


function collectEditValues(card) {

    const values = {};

    const editor =
        card.querySelector(".info-edit");

    editor.querySelectorAll(".edit-row")
        .forEach(row => {

            const key =
                row.querySelector(".edit-label")
                    .dataset.fieldKey ||
                row.querySelector(".edit-label").textContent.trim();

            /*
             * reviewed
             */
            if (key === "reviewed") {

                values[key] =
                    row.querySelector(
                        ".edit-reviewed"
                    ).checked;

                return;
            }

            const booleanInput = row.querySelector(".edit-boolean");
            if (booleanInput) {
                values[key] = booleanInput.checked;
                return;
            }

            /*
             * List
             */
            const list =
                row.querySelector(".edit-list");

            if (list) {

                values[key] =
                    [...list.querySelectorAll("input")]
                        .map(input => input.value.trim())
                        .filter(value => value !== "");

                return;
            }

            /*
             * Scalar
             */
            const input =
                row.querySelector(".edit-scalar");

            values[key] =
                input ? input.value.trim() : "";

            if (key === "tags") {
                values[key] = values[key]
                    .split(/[\s,]+/)
                    .map(tag => tag.replace(/[^\p{L}\p{N}_]/gu, "").toLowerCase())
                    .filter(tag => Array.from(tag).length > 1)
                    .map(tag => `#${tag}`)
                    .join(" ");
            }
        });

    return values;
}
async function saveEdit(card) {
    const objectType = card.dataset.objectType;
    const objectId = card.dataset.objectId;
    const sectionName = card.dataset.section;
    const token = card.dataset.editToken;
    const values = collectEditValues(card);

    if (Array.isArray(values.segments) && Array.isArray(values.revenue_share)) {
        if (values.segments.length !== values.revenue_share.length) {
            alert("The number of revenue shares must match the number of segments.");
            return;
        }

        const shares = values.revenue_share.map(value => Number(value));
        if (shares.some(value => !Number.isFinite(value) || value < 0)) {
            alert("Revenue shares must be valid non-negative numbers.");
            return;
        }

        const total = shares.reduce((sum, value) => sum + value, 0);
        if (shares.length > 0 && total <= 0) {
            alert("The total revenue share must be greater than zero.");
            return;
        }

        values.revenue_share = total > 0
            ? shares.map(value => Math.round((value / total) * 100) / 100)
            : [];
    }

    const hideProgress = window.showPythonProgress("Saving information…");

    try {
        const response = await fetch("/api/update-info", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                token: token,
                objectType: objectType,
                objectId: objectId,
                section: sectionName,
                values: values
            })
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const result = await response.json();

        console.log(result);

        window.location.reload();

    } catch (error) {
        console.error(error);
        alert(error.message);
    } finally {
        hideProgress();
    }
}

function exitEditMode(card, reload) {

    if (reload) {
        location.reload();
        return;
    }

    const content =
        card.querySelector(".qualitative-content");

    content.innerHTML =
        card.dataset.originalContent;

    /*
     * Restore password/edit controls.
     */
    const actions =
        card.querySelector(".qualitative-actions");

    actions.innerHTML = card.dataset.originalActions;

    actions.querySelector(".edit-button")
        .addEventListener("click", () => {
            enterEditMode(card);
        });
}


/*
 * Initial event handlers
 */
document.addEventListener("DOMContentLoaded", () => {

    document.addEventListener("keydown", event => {
        const infoCard = [...document.querySelectorAll(
            '.qualitative-card[data-section="info_section"]'
        )][0];
        const targetIsTextField = event.target.matches(
            "input:not([type='checkbox']), textarea, select, [contenteditable='true']"
        );
        const editor = infoCard?.querySelector(".info-edit");

        if (
            event.ctrlKey &&
            !event.altKey &&
            !event.metaKey &&
            event.key.toLowerCase() === "c" &&
            editor
        ) {
            const actionButton = infoCard.querySelector(".cancel-button");

            if (actionButton) {
                event.preventDefault();
                actionButton.click();
                return;
            }
        }

        if (event.key.toLowerCase() === "p") {
            const targetIsEditable = event.target.matches(
                "input, textarea, select, [contenteditable='true']"
            );

            if (infoCard && !infoCard.querySelector(".info-edit") && !targetIsEditable) {
                const passwordInput = infoCard.querySelector(".edit-password");
                if (passwordInput) {
                    event.preventDefault();
                    passwordInput.focus();
                }
            }
            return;
        }

        if (event.key.toLowerCase() === "v") {
            if (editor && !targetIsTextField) {
                const reviewed = editor.querySelector(".edit-reviewed");
                if (reviewed) {
                    event.preventDefault();
                    reviewed.checked = !reviewed.checked;
                    reviewed.dispatchEvent(new Event("change", { bubbles: true }));
                }
            }
            return;
        }

        if (event.key.toLowerCase() === "s") {
            if (editor && !targetIsTextField) {
                const createSegmentsRow = [...editor.querySelectorAll(".edit-row")]
                    .find(row => row.querySelector(".edit-label")?.textContent.trim() === "create_segments");
                const createSegments = createSegmentsRow?.querySelector(".edit-boolean");

                if (createSegments) {
                    event.preventDefault();
                    createSegments.checked = !createSegments.checked;
                }
            }
            return;
        }

        if (event.key.toLowerCase() === "t") {
            if (editor && !targetIsTextField) {
                const fieldRow = [...editor.querySelectorAll(".edit-row")]
                    .find(row => row.querySelector(".edit-label")?.dataset.fieldKey === "tags");
                const field = fieldRow?.querySelector(".edit-scalar");

                if (field) {
                    event.preventDefault();
                    field.focus();
                }
            }
            return;
        }

        if (event.key.toLowerCase() === "n") {
            if (editor && !targetIsTextField) {
                const fieldRow = [...editor.querySelectorAll(".edit-row")]
                    .find(row => row.querySelector(".edit-label")?.dataset.fieldKey === "notes");
                const field = fieldRow?.querySelector(".edit-scalar");

                if (field) {
                    event.preventDefault();
                    field.focus();
                }
            }
            return;
        }

        if (
            event.key !== "Enter" ||
            !event.target.matches(".edit-password")
        ) {
            return;
        }

        event.preventDefault();

        const card = event.target.closest(".qualitative-card");
        card?.querySelector(".edit-button")?.click();
    });

    document
        .querySelectorAll(".qualitative-card[data-section]")
        .forEach(card => {

            const button =
                card.querySelector(".edit-button");

            if (button) {
                button.addEventListener(
                    "click",
                    () => enterEditMode(card)
                );
            }
        });
});
