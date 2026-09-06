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
        label.textContent = key;

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
                ? " Reviewed"
                : " Not reviewed";

            checkbox.addEventListener("change", () => {
                text.textContent = checkbox.checked
                    ? " Reviewed"
                    : " Not reviewed";
            });

            valueDiv.appendChild(checkbox);
            valueDiv.appendChild(text);
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
    cancelButton.textContent = "Cancel";

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
                    .textContent.trim();

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
        });

    return values;
}
async function saveEdit(card) {
    const objectType = card.dataset.objectType;
    const objectId = card.dataset.objectId;
    const sectionName = card.dataset.section;
    const token = card.dataset.editToken;
    const values = collectEditValues(card);

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

    actions.innerHTML = `
        <input
            class="edit-password"
            type="password"
            maxlength="4"
            inputmode="numeric"
            placeholder="••••"
        >

        <button
            class="edit-button"
            type="button"
            title="Edit"
        >✎</button>
    `;

    actions.querySelector(".edit-button")
        .addEventListener("click", () => {
            enterEditMode(card);
        });
}


/*
 * Initial event handlers
 */
document.addEventListener("DOMContentLoaded", () => {

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