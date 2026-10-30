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
            if (key === "notes") {
                const input = document.createElement("textarea");
                input.className = "edit-scalar edit-notes";
                input.rows = 6;
                input.value = value ?? "";
                valueDiv.appendChild(input);
            } else {
                const input = document.createElement("input");
                input.type = "text";
                input.className = "edit-scalar";
                input.value = value ?? "";
                valueDiv.appendChild(input);
            }
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

    const saveButton =
        document.createElement("button");

    saveButton.type = "button";
    saveButton.className = "save-button";
    saveButton.textContent = "Save (^e)";

    saveButton.addEventListener("click", () => {
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
        saveButton.cloneNode(true)
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

            const scalarValue = input ? input.value.trim() : "";
            values[key] = scalarValue === "None" ? null : scalarValue;

            if (key === "tags") {
                const normalizedTags = values[key]
                    .split(/[\s,]+/)
                    .map(tag => tag.replace(/[^\p{L}\p{N}_]/gu, "").toLowerCase())
                    .filter(tag => Array.from(tag).length > 1);

                values[key] = [...new Set(normalizedTags)]
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

    if (Array.isArray(values.opmargin) && values.opmargin.some(value =>
        value === null || (typeof value === "string" && /\bnone\b/i.test(value))
    )) {
        delete values.opmargin;
    }

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
                values: values,
                progressId: hideProgress.progressId,
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

async function deleteLlmResearch(button, dialog, mirrorDialog = dialog) {
    const buttonWindow = button.ownerDocument.defaultView || window;
    if (!dialog || !buttonWindow.confirm("Delete this saved LLM Research Markdown file?")) {
        return;
    }

    const sourceWindow = dialog.ownerDocument.defaultView;
    const htmlPath = decodeURIComponent(sourceWindow.location.pathname.replace(/^\//, ""));
    const hideProgress = window.showPythonProgress("Deleting LLM research…");
    button.disabled = true;
    try {
        const response = await fetch("/api/delete-markdown", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                objectType: dialog.dataset.objectType,
                objectId: dialog.dataset.objectId,
                htmlPath,
                kind: "llm_research",
                progressId: hideProgress.progressId,
            }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) {
            throw new Error(result.error || "Could not delete LLM research.");
        }

        for (const target of new Set([dialog, mirrorDialog])) {
            if (!target) continue;
            const status = target.querySelector(".llm-research-status");
            if (status) status.textContent = "(update to create)";
            const markdown = target.querySelector(".llm-research-markdown");
            if (markdown) {
                markdown.innerHTML = '<p class="llm-research-missing">LLM research md file is missing...</p>';
            }
            target.removeAttribute("data-research-hash");
            target.querySelector(".llm-research-delete-button")?.remove();
        }
    } catch (error) {
        for (const target of new Set([dialog, mirrorDialog])) {
            const status = target?.querySelector(".llm-research-status");
            if (status) status.textContent = error.message || "Could not delete LLM research.";
        }
    } finally {
        button.disabled = false;
        hideProgress();
    }
}

function openLlmResearchWindow(dialog) {
    const objectType = dialog.dataset.objectType;
    const objectId = dialog.dataset.objectId;
    const windowName = `llm-research-${objectType}-${objectId}`
        .replace(/[^a-zA-Z0-9_-]/g, "-");
    const popupHeight = Math.round(window.screen.availHeight * 0.8);
    const popupWidth = Math.round(window.screen.availWidth * 0.8);
    const popupLeft = window.screen.availLeft
        + Math.max(0, window.screen.availWidth - popupWidth);
    const popupTop = window.screen.availTop
        + Math.round(window.screen.availHeight * 0.1);
    const researchWindow = window.open(
        "",
        windowName,
        `popup=yes,width=${popupWidth},height=${popupHeight},left=${popupLeft},top=${popupTop},resizable=yes,scrollbars=yes`
    );
    if (!researchWindow) {
        dialog.showModal();
        return;
    }

    const popupDocument = researchWindow.document;
    popupDocument.open();
    popupDocument.write("<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body></body></html>");
    popupDocument.close();
    popupDocument.title = `LLM Research — ${objectId}`;

    for (const stylesheet of document.querySelectorAll('link[rel="stylesheet"]')) {
        const link = popupDocument.createElement("link");
        link.rel = "stylesheet";
        link.href = stylesheet.href;
        popupDocument.head.appendChild(link);
    }
    const popupStyle = popupDocument.createElement("style");
    popupStyle.textContent = `
        html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
        body { color: #1f2937; background: #fff; }
        .llm-research-popup { display: flex; flex-direction: column; width: 100%; height: 100%; }
        .llm-research-popup .llm-research-dialog-header { flex: 0 0 auto; position: static; }
        .llm-research-popup .llm-research-dialog-content {
            box-sizing: border-box; flex: 1 1 auto; width: 100%; min-height: 0;
            max-height: none; overflow: auto;
        }
    `;
    popupDocument.head.appendChild(popupStyle);

    const header = popupDocument.importNode(
        dialog.querySelector(".llm-research-dialog-header"), true
    );
    const content = popupDocument.importNode(
        dialog.querySelector(".llm-research-dialog-content"), true
    );
    const popupDialog = popupDocument.createElement("div");
    popupDialog.className = "llm-research-popup";
    popupDialog.dataset.objectType = objectType;
    popupDialog.dataset.objectId = objectId;
    if (dialog.dataset.researchHash) {
        popupDialog.dataset.researchHash = dialog.dataset.researchHash;
    }
    popupDialog.append(header, content);
    popupDocument.body.replaceChildren(popupDialog);

    popupDocument.querySelector(".llm-research-close")?.addEventListener(
        "click",
        () => researchWindow.close()
    );
    popupDocument.querySelector(".llm-research-delete-button")?.addEventListener(
        "click",
        event => deleteLlmResearch(event.currentTarget, dialog, popupDialog)
    );
}

function openPlotWindow(button, plotType) {
    const template = document.getElementById(button.getAttribute("aria-controls"));
    if (!template) return;
    const popupWidth = Math.round(window.screen.availWidth * 0.8);
    const popupHeight = Math.round(window.screen.availHeight * 0.7);
    const popupLeft = window.screen.availLeft
        + Math.max(0, (window.screen.availWidth - popupWidth) / 2);
    const popupTop = window.screen.availTop
        + Math.round(window.screen.availHeight * 0.1);
    const plotWindow = window.open(
        "",
        `${plotType}-plot-${template.id}`,
        `popup=yes,width=${popupWidth},height=${popupHeight},left=${popupLeft},top=${popupTop},resizable=yes,scrollbars=yes`
    );
    if (!plotWindow) return;

    const title = template.dataset.title || `${plotType.toUpperCase()} plot`;
    const stylesheets = [...document.querySelectorAll('link[rel="stylesheet"]')]
        .map(link => `<link rel="stylesheet" href="${link.href}">`)
        .join("");
    plotWindow.document.open();
    plotWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${title.replace(/[<>&"']/g, "")}</title>${stylesheets}
        <style>html,body{width:100%;height:100%;margin:0}body{overflow:hidden}.${plotType}-plot-popup{width:100%;height:100%}.${plotType}-plot-popup .plotly-graph-div{width:100%!important;height:100%!important}</style>
        </head><body><main class="${plotType}-plot-popup">${template.innerHTML}</main></body></html>`);
    plotWindow.document.close();
}

function openRomaPlotWindow(button) {
    openPlotWindow(button, "roma");
}

function openMpPlotWindow(button) {
    const objectType = button.dataset.objectType;
    const objectKey = button.dataset.objectId;
    const popupWidth = Math.round(window.screen.availWidth * 0.8);
    const popupHeight = Math.round(window.screen.availHeight * 0.7);
    const popupLeft = window.screen.availLeft
        + Math.max(0, (window.screen.availWidth - popupWidth) / 2);
    const popupTop = window.screen.availTop
        + Math.round(window.screen.availHeight * 0.1);
    const plotWindow = window.open(
        "",
        `mp-plot-${objectType}-${objectKey}`,
        `popup=yes,width=${popupWidth},height=${popupHeight},left=${popupLeft},top=${popupTop},resizable=yes,scrollbars=yes`
    );
    if (!plotWindow) return;

    plotWindow.document.open();
    plotWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>html,body{width:100%;height:100%;margin:0}body{overflow:hidden}
        #mp-plot{width:100%;height:100%}</style>
        </head><body><div id="mp-plot-status" style="padding:12px">Loading MP plot…</div>
        <div id="mp-plot"></div></body></html>`);
    plotWindow.document.close();
    plotWindow.document.title = `MP plot — ${objectKey}`;

    const plotlyScript = plotWindow.document.createElement("script");
    plotlyScript.src = new URL("/plotly.min.js", location.origin).href;
    plotlyScript.onload = async () => {
        const status = plotWindow.document.getElementById("mp-plot-status");
        try {
            const endpoint = new URL("/api/mp-plot", location.origin);
            endpoint.searchParams.set("type", objectType);
            endpoint.searchParams.set("key", objectKey);
            const response = await fetch(endpoint);
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Could not load MP plot.");

            const graph = plotWindow.document.getElementById("mp-plot");
            await plotWindow.Plotly.react(
                graph,
                result.figure.data,
                result.figure.layout,
                { responsive: true }
            );
            status.remove();
            graph.on("plotly_clickannotation", event => {
                const name = event.annotation?.name || "";
                const pageUrl = name.slice(name.indexOf("::") + 2);
                if (pageUrl) plotWindow.open(new URL(pageUrl, location.origin), "_blank", "noopener");
            });
            const categoryVisibility = new Map(
                result.figure.data.map(trace => [trace.legendgroup || trace.name, true])
            );
            graph.on("plotly_legendclick", event => {
                const category = graph.data[event.curveNumber]?.legendgroup;
                if (!category) return;
                const visible = !categoryVisibility.get(category);
                categoryVisibility.set(category, visible);
                setTimeout(() => {
                    const annotations = (graph.layout.annotations || []).map(annotation =>
                        annotation.name?.startsWith(`${category}::`)
                            ? { ...annotation, visible }
                            : annotation
                    );
                    plotWindow.Plotly.relayout(graph, { annotations });
                }, 0);
            });
        } catch (error) {
            status.textContent = error.message || "Could not load MP plot.";
        }
    };
    plotlyScript.onerror = () => {
        plotWindow.document.getElementById("mp-plot-status").textContent = "Could not load Plotly.";
    };
    plotWindow.document.head.appendChild(plotlyScript);
}

function openMvPlotWindow(button) {
    const code = button.dataset.code;
    const popupWidth = Math.round(window.screen.availWidth * 0.85);
    const popupHeight = Math.round(window.screen.availHeight * 0.8);
    const popupLeft = window.screen.availLeft
        + Math.max(0, (window.screen.availWidth - popupWidth) / 2);
    const popupTop = window.screen.availTop
        + Math.round(window.screen.availHeight * 0.08);
    const plotWindow = window.open(
        "",
        `mv-plot-${code}`,
        `popup=yes,width=${popupWidth},height=${popupHeight},left=${popupLeft},top=${popupTop},resizable=yes,scrollbars=yes`
    );
    if (!plotWindow) return;

    plotWindow.document.open();
    plotWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>MV plot — ${code}</title>
        <style>html,body{width:100%;height:100%;margin:0}body{overflow:hidden}
        #mv-plot{width:100%;height:100%}</style>
        </head><body><div id="mv-plot-status" style="padding:12px">Loading MV plot…</div>
        <div id="mv-plot"></div></body></html>`);
    plotWindow.document.close();

    const plotlyScript = plotWindow.document.createElement("script");
    plotlyScript.src = new URL("/plotly.min.js", location.origin).href;
    plotlyScript.onload = async () => {
        const status = plotWindow.document.getElementById("mv-plot-status");
        try {
            const endpoint = new URL("/api/mv-plot", location.origin);
            endpoint.searchParams.set("code", code);
            const response = await fetch(endpoint);
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Could not load MV plot.");

            await plotWindow.Plotly.react(
                plotWindow.document.getElementById("mv-plot"),
                result.figure.data,
                result.figure.layout,
                { responsive: true }
            );
            status.remove();
        } catch (error) {
            status.textContent = error.message || "Could not load MV plot.";
        }
    };
    plotlyScript.onerror = () => {
        plotWindow.document.getElementById("mv-plot-status").textContent = "Could not load Plotly.";
    };
    plotWindow.document.head.appendChild(plotlyScript);
}

/*
 * Initial event handlers
 */
document.addEventListener("DOMContentLoaded", () => {

    const plotTarget = [...document.querySelectorAll(".llm-research-trigger-row")]
        .find(row => ["Component", "ValueChain"].includes(row.dataset.objectType));
    if (plotTarget && !plotTarget.querySelector(".mp-plot-link")) {
        const mpButton = document.createElement("button");
        mpButton.className = "mp-plot-link";
        mpButton.type = "button";
        mpButton.textContent = "MP plot (m)";
        mpButton.title = "Margin vs PER plot (m)";
        mpButton.setAttribute("aria-haspopup", "dialog");
        mpButton.dataset.objectType = plotTarget.dataset.objectType;
        mpButton.dataset.objectId = plotTarget.dataset.objectId;
        const romaButton = plotTarget.querySelector(".roma-plot-link");
        if (romaButton) romaButton.after(mpButton);
        else plotTarget.appendChild(mpButton);
    }

    // Keep the research entry point available on older generated Profile pages.
    const profileButton = [...document.querySelectorAll(".model-instance-update-button")]
        .find(button => button.dataset.objectType === "Profile");
    if (profileButton) {
        const objectId = profileButton.dataset.objectId;
        let researchRow = document.querySelector(".llm-research-trigger-row");
        if (!researchRow) {
            researchRow = document.createElement("div");
            researchRow.className = "llm-research-trigger-row";
            const newsHeading = [...document.querySelectorAll("h3")]
                .find(heading => heading.textContent.trim().toLowerCase() === "news");
            if (newsHeading) {
                newsHeading.before(researchRow);
            } else {
                document.querySelector(".qualitative-section")?.after(researchRow);
            }
        }
        if (researchRow) {
            researchRow.dataset.objectType = "Profile";
            researchRow.dataset.objectId = objectId;
            const dialogId = `llm-research-dialog-${objectId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
            let researchLink = researchRow.querySelector(".llm-research-link");
            if (!researchLink) {
                researchLink = document.createElement("button");
                researchLink.className = "llm-research-link";
                researchLink.type = "button";
                researchLink.textContent = "LLM Research (l)";
                researchLink.setAttribute("aria-haspopup", "dialog");
                researchRow.appendChild(researchLink);
            }
            researchLink.setAttribute("aria-controls", dialogId);

            let dialog = document.getElementById(dialogId);
            if (!dialog) {
                dialog = document.createElement("dialog");
                dialog.className = "llm-research-dialog";
                dialog.id = dialogId;
                dialog.innerHTML = `
                    <div class="llm-research-dialog-header">
                        <h2 id="${dialogId}-title">LLM Research</h2>
                        <div class="llm-research-dialog-header-actions">
                            <button class="llm-research-close" type="button" aria-label="Close research">×</button>
                        </div>
                    </div>
                    <div class="llm-research-dialog-content">
                        <div class="llm-research-markdown"></div>
                        <div class="llm-research-dialog-actions"></div>
                    </div>`;
                document.body.appendChild(dialog);
                const legacyContent = document.querySelector(".llm-research-card .llm-research-content");
                const markdown = dialog.querySelector(".llm-research-markdown");
                if (legacyContent) {
                    markdown.innerHTML = legacyContent.innerHTML;
                    legacyContent.closest(".llm-research-card")?.remove();
                } else {
                    markdown.innerHTML = '<p class="llm-research-missing">LLM research md file is missing...</p>';
                }
            }
            dialog.dataset.objectType = "Profile";
            dialog.dataset.objectId = objectId;
            dialog.setAttribute("aria-labelledby", `${dialogId}-title`);

            const dialogContent = dialog.querySelector(".llm-research-dialog-content");
            if (dialogContent && !dialogContent.querySelector(".llm-research-markdown")) {
                const markdown = document.createElement("div");
                markdown.className = "llm-research-markdown";
                const existingActions = dialogContent.querySelector(".llm-research-dialog-actions");
                [...dialogContent.childNodes]
                    .filter(node => node !== existingActions)
                    .forEach(node => markdown.appendChild(node));
                dialogContent.insertBefore(markdown, existingActions || null);
            }

            let actions = dialog.querySelector(".llm-research-dialog-actions");
            if (!actions) {
                actions = document.createElement("div");
                actions.className = "llm-research-dialog-actions";
                dialog.querySelector(".llm-research-dialog-content")?.appendChild(actions);
            }
            let headerActions = dialog.querySelector(".llm-research-dialog-header-actions");
            if (!headerActions) {
                headerActions = document.createElement("div");
                headerActions.className = "llm-research-dialog-header-actions";
                const closeButton = dialog.querySelector(".llm-research-close");
                if (closeButton) headerActions.appendChild(closeButton);
                dialog.querySelector(".llm-research-dialog-header")?.appendChild(headerActions);
            }

            const markdown = dialog.querySelector(".llm-research-markdown");
            const hasResearch = Boolean(markdown?.textContent.trim())
                && !markdown.querySelector(".llm-research-missing");
            let deleteButton = dialog.querySelector(".llm-research-delete-button")
                || researchRow.querySelector(".llm-research-delete-button");
            if (hasResearch && !deleteButton) {
                deleteButton = document.createElement("button");
                deleteButton.className = "llm-research-delete-button";
                deleteButton.type = "button";
            }
            if (hasResearch) {
                deleteButton.textContent = "Delete";
                headerActions.insertBefore(deleteButton, headerActions.querySelector(".llm-research-close"));
            } else {
                deleteButton?.remove();
            }
            researchRow.querySelector(".llm-research-status")?.remove();

            if (!dialog.querySelector(".llm-research-status")) {
                const status = document.createElement("span");
                status.className = "llm-research-status";
                status.setAttribute("role", "status");
                status.setAttribute("aria-live", "polite");
                actions.appendChild(status);
            }
        }
    }

    // Add MV plot buttons to existing Profile/Segment pages generated before
    // the button was added to their HTML markup.
    document.querySelectorAll(".llm-research-trigger-row").forEach(row => {
        if (!(["Profile", "Segment"].includes(row.dataset.objectType))
            || row.querySelector(".mv-plot-link")) return;
        const objectId = row.dataset.objectId || "";
        const code = row.dataset.objectType === "Segment"
            ? objectId.match(/^(\d{6})\([A-Za-z]\)$/)?.[1]
            : objectId;
        if (!code) return;
        const mvButton = document.createElement("button");
        mvButton.className = "mv-plot-link";
        mvButton.type = "button";
        mvButton.textContent = "MV plot (v)";
        mvButton.title = "Market-cap movement plot (v)";
        mvButton.setAttribute("aria-haspopup", "dialog");
        mvButton.dataset.code = code;
        const romaButton = row.querySelector(".roma-plot-link");
        if (romaButton) romaButton.after(mvButton);
        else row.appendChild(mvButton);
    });

    document.querySelectorAll(".llm-research-link").forEach(button => {
        const dialog = document.getElementById(button.getAttribute("aria-controls"));
        if (!dialog) return;

        const markdown = dialog.querySelector(".llm-research-markdown");
        const hasResearch = Boolean(markdown?.textContent.trim())
            && !markdown.querySelector(".llm-research-missing");
        button.classList.toggle("llm-research-missing", !hasResearch);
        button.textContent = "LLM Research (l)";

        button.addEventListener("click", () => openLlmResearchWindow(dialog));
        dialog.querySelector(".llm-research-close")?.addEventListener("click", () => dialog.close());
        dialog.addEventListener("click", event => {
            if (event.target === dialog) dialog.close();
        });
    });

    document.querySelectorAll(".roma-plot-link").forEach(button => {
        button.addEventListener("click", () => openRomaPlotWindow(button));
    });
    document.querySelectorAll(".mp-plot-link").forEach(button => {
        button.addEventListener("click", () => openMpPlotWindow(button));
    });
    document.querySelectorAll(".mv-plot-link").forEach(button => {
        button.addEventListener("click", () => openMvPlotWindow(button));
    });

    document.addEventListener("keydown", event => {
        const target = event.target;
        const typing = target instanceof Element && (
            target.matches("input, textarea, select, [contenteditable='true']")
            || target.closest("[contenteditable='true']")
        );
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || typing) return;
        const key = event.key.toLowerCase();
        const button = key === "r"
            ? document.querySelector(".roma-plot-link")
            : key === "m"
                ? document.querySelector(".mp-plot-link")
                : key === "v"
                    ? document.querySelector(".mv-plot-link")
                    : null;
        if (button) {
            event.preventDefault();
            if (key === "r") openRomaPlotWindow(button);
            else if (key === "m") openMpPlotWindow(button);
            else openMvPlotWindow(button);
        }
    });

    document.querySelectorAll(".llm-research-delete-button").forEach(button => {
        button.addEventListener("click", () => {
            const dialog = button.closest(".llm-research-dialog");
            if (dialog) deleteLlmResearch(button, dialog);
        });
    });

    const instanceButton = document.querySelector(".model-instance-update-button");
    const objectType = instanceButton?.dataset.objectType;
    const objectId = instanceButton?.dataset.objectId;
    const newsCard = [...document.querySelectorAll(".qualitative-card")]
        .find(card => card.querySelector(".qualitative-header h4")
            ?.textContent.trim().toLowerCase() === "news");

    if (newsCard && objectType && objectId
        && !newsCard.querySelector(".news-update-button")) {
        const actions = document.createElement("div");
        actions.className = "qualitative-actions";
        const button = document.createElement("button");
        button.className = "news-update-button";
        button.type = "button";
        button.textContent = "Update";
        actions.appendChild(button);
        newsCard.querySelector(".qualitative-header")?.appendChild(actions);
    }

    document.querySelectorAll(".news-row").forEach(row => {
        row.dataset.objectType ||= objectType || "";
        row.dataset.objectId ||= objectId || "";
        if (!row.dataset.newsFile) {
            const onclick = row.querySelector("a")?.getAttribute("onclick") || "";
            const match = onclick.match(/openPopup\(['\"]([^'\"]+)/);
            if (match) {
                try {
                    row.dataset.newsFile = decodeURIComponent(
                        new URL(match[1], location.href).pathname.split("/").pop()
                    );
                } catch (error) {
                    console.error("Could not identify saved news article:", error);
                }
            }
        }
        if (!row.dataset.newsPath) {
            const onclick = row.querySelector("a")?.getAttribute("onclick") || "";
            const match = onclick.match(/openPopup\(['\"]([^'\"]+)/);
            if (match) {
                try {
                    row.dataset.newsPath = decodeURIComponent(
                        new URL(match[1], location.href).pathname.replace(/^\/+/, "")
                    );
                } catch (error) {
                    console.error("Could not identify saved news article path:", error);
                }
            }
        }
        if (row.dataset.newsFile && !row.querySelector(".news-delete-button")) {
            const button = document.createElement("button");
            button.className = "news-delete-button";
            button.type = "button";
            button.title = "Delete article";
            button.setAttribute("aria-label", "Delete article");
            button.textContent = "×";
            row.appendChild(button);
        }
    });

    document.querySelectorAll(".news-update-button").forEach(button => {
        button.addEventListener("click", async () => {
            const hideProgress = window.showPythonProgress("Collecting and summarizing news…");
            button.disabled = true;
            try {
                const response = await fetch("/api/update-news", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        objectType: button.dataset.objectType || objectType,
                        objectId: button.dataset.objectId || objectId,
                        progressId: hideProgress.progressId,
                    }),
                });
                const result = await response.json();
                if (!response.ok || !result.ok) {
                    throw new Error(result.error || "News update failed.");
                }
                window.location.reload();
            } catch (error) {
                alert(error.message || "News update failed.");
                button.disabled = false;
            } finally {
                hideProgress();
            }
        });
    });

    document.querySelectorAll(".news-delete-button").forEach(button => {
        button.addEventListener("click", async () => {
            const row = button.closest(".news-row");
            const hideProgress = window.showPythonProgress("Deleting news article…");
            button.disabled = true;
            try {
                const response = await fetch("/api/delete-markdown", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        objectType: row.dataset.objectType,
                        objectId: row.dataset.objectId,
                        markdownName: row.dataset.newsFile,
                        markdownPath: row.dataset.newsPath,
                        htmlPath: decodeURIComponent(location.pathname.slice(1)),
                        progressId: hideProgress.progressId,
                    }),
                });
                const result = await response.json();
                if (!response.ok || !result.ok) {
                    throw new Error(result.error || "Could not delete news article.");
                }
                row.remove();
                const section = document.querySelector(".news-section");
                if (section && !section.querySelector(".news-row")) {
                    section.previousElementSibling?.remove();
                    section.remove();
                }
            } catch (error) {
                alert(error.message || "Could not delete news article.");
                button.disabled = false;
            } finally {
                hideProgress();
            }
        });
    });

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

        if (
            event.ctrlKey &&
            !event.altKey &&
            !event.metaKey &&
            event.key.toLowerCase() === "e" &&
            editor &&
            !targetIsTextField
        ) {
            const actionButton = infoCard.querySelector(".save-button");

            if (actionButton) {
                event.preventDefault();
                actionButton.click();
                return;
            }
        }

        if (
            !event.ctrlKey &&
            !event.altKey &&
            !event.metaKey &&
            event.key.toLowerCase() === "l" &&
            !targetIsTextField
        ) {
            const researchButton = document.querySelector(".llm-research-link");
            if (researchButton) {
                event.preventDefault();
                researchButton.click();
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
