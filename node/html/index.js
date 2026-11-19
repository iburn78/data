let currentSection = "";
let currentItems = [];
let lastTagSearchQuery = "";
let listPlotLoadId = 0;
let plotlyLoadPromise = null;
let manualLoadId = 0;
let searchHelpRequest = 0;
let listScopes = null;
const expandedScopes = new Map();

const HANGUL_INITIALS = [
    "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
    "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];
const DOUBLE_HANGUL_INITIALS = {
    "ㄱ": "ㄲ",
    "ㄷ": "ㄸ",
    "ㅂ": "ㅃ",
    "ㅅ": "ㅆ",
    "ㅈ": "ㅉ",
};

function scopeCharacters(label) {
    if (label === "0-9") return "0123456789";
    if (/^[A-Z]-[A-Z]$/.test(label)) {
        const [first, last] = label.split("-").map(letter => letter.charCodeAt(0));
        return Array.from({ length: last - first + 1 }, (_, index) =>
            String.fromCharCode(first + index)
        ).join("");
    }
    if (/^[ㄱ-ㅎ]-[ㄱ-ㅎ]$/.test(label)) {
        const [first, last] = label.split("-");
        const firstIndex = HANGUL_INITIALS.indexOf(first);
        const lastIndex = HANGUL_INITIALS.indexOf(last);
        if (firstIndex >= 0 && lastIndex >= firstIndex) {
            return HANGUL_INITIALS.slice(firstIndex, lastIndex + 1).join("");
        }
    }

    const characters = new Set();
    for (const character of label.normalize("NFC")) {
        if (HANGUL_INITIALS.includes(character)) {
            characters.add(character);
            if (DOUBLE_HANGUL_INITIALS[character]) {
                characters.add(DOUBLE_HANGUL_INITIALS[character]);
            }
        } else if (/^[A-Z0-9]$/i.test(character)) {
            characters.add(character.toUpperCase());
        }
    }
    return [...characters].join("");
}

async function loadListScopes() {
    if (listScopes) return;
    const response = await fetch("/api/list-scopes");
    if (!response.ok) throw new Error("Could not load list scopes.");
    const result = await response.json();
    listScopes = result.scopes ?? {};
}

function getListScope(name, section) {
    const first = Array.from((name || "").trim().normalize("NFC"))[0] || "";
    if (!first) return "Others";

    const code = first.codePointAt(0);
    const initial = code >= 0xac00 && code <= 0xd7a3
        ? HANGUL_INITIALS[Math.floor((code - 0xac00) / 588)]
        : first.toUpperCase();
    return (listScopes?.[section] ?? []).find(label =>
        scopeCharacters(label).includes(initial)
    ) ?? "Others";
}

function getExpandedScopes(section) {
    if (!expandedScopes.has(section)) {
        expandedScopes.set(section, new Set());
    }
    return expandedScopes.get(section);
}

function renderListActions() {
    const actions = document.getElementById("list-actions");
    actions.replaceChildren();
    actions.hidden = !listScopes?.[currentSection];
    if (actions.hidden) return;

    for (const [label, title, expand] of [
        ["+", `Expand all ${sections[currentSection].toLowerCase()} groups`, true],
        ["−", `Collapse all ${sections[currentSection].toLowerCase()} groups`, false],
    ]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "list-action";
        button.textContent = label;
        button.title = title;
        button.setAttribute("aria-label", title);
        button.addEventListener("click", () => {
            expandedScopes.set(
                currentSection,
                expand
                    ? new Set([...listScopes[currentSection], "Others"])
                    : new Set(),
            );
            renderSection();
        });
        actions.appendChild(button);
    }

    const totalCount = currentSection === "profiles"
        ? currentItems.filter(item => !item.isSegment).length
        : currentItems.length;
    const totalLabel = {
        profiles: "profiles",
        components: "components",
        valuechains: "value chains",
    }[currentSection];
    const total = document.createElement("span");
    total.className = "list-total-count";
    total.textContent = `(${totalCount} ${totalLabel})`;
    actions.appendChild(total);
}

function hideSearchHelp() {
    searchHelpRequest += 1;
    document.getElementById("search-help").hidden = true;
}

async function showSearchHelp() {
    const help = document.getElementById("search-help");
    const request = ++searchHelpRequest;
    help.hidden = false;
    help.textContent = "Loading search tips…";

    try {
        const response = await fetch("/api/search-help");
        if (!response.ok) throw new Error("Could not load search tips.");
        const result = await response.json();
        if (request !== searchHelpRequest) return;
        help.textContent = result.text || "";
    } catch (error) {
        if (request !== searchHelpRequest) return;
        help.textContent = error.message || "Could not load search tips.";
    }
}

function hideListPlot() {
    listPlotLoadId += 1;
    document.getElementById("model-list-plot").hidden = true;
}

function loadPlotly() {
    if (window.Plotly) return Promise.resolve(window.Plotly);
    if (plotlyLoadPromise) return plotlyLoadPromise;

    plotlyLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/plotly.min.js";
        script.onload = () => resolve(window.Plotly);
        script.onerror = () => {
            plotlyLoadPromise = null;
            reject(new Error("Could not load Plotly."));
        };
        document.head.appendChild(script);
    });
    return plotlyLoadPromise;
}

async function showListPlot(section) {
    const configs = {
        profiles: {
            endpoint: "/api/profile-plot",
            loadingLabel: "profile",
            title: "Profiles",
        },
        components: {
            endpoint: "/api/collection-plot?type=Component",
            loadingLabel: "component",
            title: "Components",
        },
        valuechains: {
            endpoint: "/api/collection-plot?type=ValueChain",
            loadingLabel: "valuechain",
            title: "Value Chains",
        },
    };
    const config = configs[section];
    if (!config) return;
    const loadId = ++listPlotLoadId;
    const plotPanel = document.getElementById("model-list-plot");
    const plot = document.getElementById("model-list-plot-chart");
    document.getElementById("model-list-plot-title").textContent = config.title;
    plotPanel.hidden = false;
    if (!plot.dataset.ready) plot.textContent = `Loading ${config.loadingLabel} plot…`;

    try {
        const [response] = await Promise.all([
            fetch(config.endpoint),
            loadPlotly(),
        ]);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || `Could not load ${config.loadingLabel} plot data (HTTP ${response.status}).`);
        }
        const {
            points,
            category_colors: colors,
            per_bound: perBound,
            plot_style: plotStyle,
        } = payload;
        if (loadId !== listPlotLoadId || plotPanel.hidden) return;

        const traces = ["A", "B", "C", "D"].map(category => {
            const categoryPoints = points.filter(point => point.category === category);
            const markerTrace = {
                type: "scatter",
                mode: "markers",
                name: category,
                legendgroup: category,
                x: categoryPoints.map(point => point.opmargin_ltm),
                y: categoryPoints.map(point => point.PER_ltm),
                text: categoryPoints.map(point => point.label),
                customdata: categoryPoints.map(point => [point.page_url, point.code]),
                marker: { color: colors[category], size: plotStyle.marker_size, opacity: 0.85 },
                hovertemplate: "%{text}<br>Code: %{customdata[1]}<br>"
                    + "Operating margin: %{x:.1%}<br>PER (LTM): %{y:.2f}"
                    + "<extra>" + category + "</extra>",
            };
            const labelTraces = [false, true].flatMap(bold => {
                const labelPoints = categoryPoints.filter(point => Boolean(point.bold_label) === bold);
                if (!labelPoints.length) return [];
                return [{
                    type: "scatter",
                    mode: "text",
                    name: `${category} labels`,
                    legendgroup: category,
                    showlegend: false,
                    x: labelPoints.map(point => point.opmargin_ltm),
                    y: labelPoints.map(point => point.PER_ltm),
                    text: labelPoints.map(point => point.label),
                    textposition: labelPoints.map(() => plotStyle.label_position),
                    textfont: {
                        color: colors[category],
                        size: plotStyle.label_font_size,
                        weight: bold ? 700 : 400,
                    },
                    customdata: labelPoints.map(point => [point.page_url, point.code]),
                    hoverinfo: "none",
                    meta: { modelListLabelTrace: true },
                }];
            });
            return [markerTrace, ...labelTraces];
        });
        const plotTraces = traces.flat();

        if (!plot.dataset.ready) plot.replaceChildren();
        await window.Plotly.react(plot, plotTraces, {
            title: { text: "" },
            template: "plotly_white",
            margin: { t: 12, r: 8, b: 55, l: 65 },
            xaxis: {
                title: { text: "X: Operating margin (LTM)", standoff: 14 },
                tickformat: ".0%",
                automargin: true,
            },
            yaxis: {
                title: { text: "Y: PER (LTM)", standoff: 14 },
                range: [0, perBound],
                automargin: true,
            },
            legend: { title: { text: "Category" }, itemclick: "toggle",
                groupclick: "togglegroup",
                tracegroupgap: plotStyle.legend_tracegroupgap,
                itemdoubleclick: false },
            clickmode: "event",
        }, { responsive: true });
        if (loadId !== listPlotLoadId || plotPanel.hidden) return;
        plot.dataset.ready = "true";

        plot.removeAllListeners?.("plotly_click");
        plot.on("plotly_click", event => {
            const points = event.points || [];
            const labelPoint = points.find(point =>
                plot.data[point.curveNumber]?.meta?.modelListLabelTrace
            );
            const point = labelPoint || points.find(item => item.customdata?.[0]);
            const url = point?.customdata?.[0];
            if (url) window.open(new URL(url, location.origin), "_blank", "noopener");
        });
    } catch (error) {
        if (loadId !== listPlotLoadId) return;
        plot.textContent = error.message || `Could not load ${config.loadingLabel} plot.`;
    }
}

// Use Unicode NFC followed by JavaScript's locale-independent UTF-16 order,
// with the original spelling as a deterministic tie-breaker.
function compareText(a, b) {
    const normalizedA = a.normalize("NFC");
    const normalizedB = b.normalize("NFC");
    if (normalizedA < normalizedB) return -1;
    if (normalizedA > normalizedB) return 1;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

const sections = {
    profiles: "Profiles",
    components: "Components",
    valuechains: "Valuechains"
};

async function getItems(section) {
    const response = await fetch(`/api/${section}`);

    if (!response.ok) {
        throw new Error(`Failed to load ${section}`);
    }

    const files = await response.json();

    const items = files.map(entry => {
        const { file, reviewed = false, recommended = false } = typeof entry === "string"
            ? { file: entry, reviewed: true, recommended: false }
            : entry;
        let text = file.replace(".html", "");

        if (section === "profiles") {
            const [code, ...name] = text.split("_");
            text = `${name.join(" ")} (${code})`;
        } else {
            text = text.replaceAll("_", " ");
        }

        return { file, text, reviewed, recommended };
    });

    if (section !== "profiles") {
        items.sort((a, b) => compareText(a.text, b.text));
        return items;
    }

    // Group profiles and their segments by code.
    const groups = new Map();

    for (const item of items) {
        const base = item.file.replace(".html", "");
        const [codePart, ...name] = base.split("_");

        // Most Korean listings use a six digit code, but some securities
        // (for example newly listed/prelisting instruments) use alphanumeric IDs.
        const match = codePart.match(/^([A-Za-z0-9]+)(?:\(([A-Z])\))?$/);
        if (!match) {
            // Keep an unexpected filename visible instead of failing the whole list.
            groups.set(base, {
                profile: item,
                segments: [],
                key: base,
            });
            continue;
        }
        const code = match[1];
        const segment = match[2] ?? null;
        item.isSegment = segment !== null;

        if (!groups.has(code)) {
            groups.set(code, {
                profile: null,
                segments: [],
                key: code,
            });
        }

        const group = groups.get(code);

        if (segment === null) {
            group.profile = item;
        } else {
            item.text = ` - ${item.text}`;
            group.segments.push({
                item,
                segment,
            });
        }
    }

    // Sort groups by the profile/company name.
    const sortedGroups = [...groups.values()].sort((a, b) => {
        const aName = a.profile?.text ?? a.segments[0]?.item.text ?? "";
        const bName = b.profile?.text ?? b.segments[0]?.item.text ?? "";
        return compareText(aName, bName);
    });

    // Within each group: profile first, then A, B, C...
    return sortedGroups.flatMap(group => {
        group.segments.sort((a, b) => compareText(a.segment, b.segment));

        const groupItems = [
            ...(group.profile ? [group.profile] : []),
            ...group.segments.map(segment => segment.item),
        ];
        const profileName = group.profile?.text.replace(/\s+\([^)]*\)$/, "") ?? "";
        for (const item of groupItems) {
            item.profileName = profileName;
            item.profileGroupKey = group.key;
        }
        return groupItems;
    });
}

// async function getItems(section) {
//     const response = await fetch(`/api/${section}`);

//     if (!response.ok) {
//         throw new Error(`Failed to load ${section}`);
//     }

//     const files = await response.json();

//     const items = files.map(file => {
//         let text = file.replace(".html", "");

//         if (section === "profiles") {
//             const [code, ...name] = text.split("_");
//             text = `${name.join(" ")} (${code})`;
//         } else {
//             text = text.replaceAll("_", " ");
//         }

//         return { file, text };
//     });

//     items.sort((a, b) => compareText(a.text, b.text));

//     return items;
// }


async function showFiles(section) {
    hideSearchHelp();
    manualLoadId += 1;
    document.getElementById("content").replaceChildren();
    currentSection = section;
    if (["profiles", "components", "valuechains"].includes(section)
        && !document.getElementById("search").value.trim()) {
        showListPlot(section);
    } else {
        hideListPlot();
    }
    currentItems = await getItems(section);
    if (["profiles", "components", "valuechains"].includes(section)) await loadListScopes();
    renderListActions();

    renderSection();
}

async function showManual() {
    hideSearchHelp();
    const loadId = ++manualLoadId;
    currentSection = "";
    currentItems = [];
    renderListActions();
    hideListPlot();
    document.getElementById("file-list").replaceChildren();

    const content = document.getElementById("content");
    const article = document.createElement("article");
    article.className = "manual-content";
    article.textContent = "Loading manual…";
    content.replaceChildren(article);

    try {
        const response = await fetch("/api/manual");
        if (!response.ok) throw new Error("Could not load the manual.");
        const manual = await response.text();
        if (loadId !== manualLoadId) return;
        article.innerHTML = manual;
    } catch (error) {
        if (loadId !== manualLoadId) return;
        article.textContent = error.message || "Could not load the manual.";
    }
}

function classificationModelHref(classificationMap, section, item) {
    const name = `${item.code} ${item.name?.ko || ""}`.trim();
    const page = classificationMap.model_pages?.[section]?.[name];
    const filename = page || name.replace(/[<>:"/\\|?*]+/g, "").trim().replace(/\s+/g, "_");
    return `/build/${section}/${encodeURIComponent(filename)}.html`;
}

function appendClassificationMapLabel(container, item, classificationMap, section) {
    const link = document.createElement("a");
    link.className = "classification-map-label-link";
    link.href = classificationModelHref(classificationMap, section, item);
    link.target = "_blank";
    link.rel = "noopener";
    link.addEventListener("click", event => event.stopPropagation());
    if (item.code) {
        const code = document.createElement("span");
        code.className = "classification-map-code";
        code.textContent = item.code;
        link.appendChild(code);
    }
    const korean = document.createElement("span");
    korean.textContent = item.name?.ko || "Unnamed";
    link.appendChild(korean);
    if (item.name?.en) {
        const english = document.createElement("span");
        english.className = "classification-map-english";
        english.textContent = item.name.en;
        link.appendChild(english);
    }
    container.appendChild(link);
}

function appendClassificationMapDefinition(container, definition) {
    if (!definition) return;
    const paragraph = document.createElement("p");
    paragraph.className = "classification-map-definition";
    paragraph.textContent = definition;
    container.appendChild(paragraph);
}

function renderClassificationMap(article, classificationMap) {
    article.replaceChildren();
    const requestedLevel = new URLSearchParams(location.search).get("classificationLevel");
    const requestedCode = new URLSearchParams(location.search).get("classificationCode");
    let selectedElement = null;
    const title = document.createElement("h1");
    title.textContent = "Classification";
    article.appendChild(title);

    const actions = document.createElement("div");
    actions.className = "classification-map-actions";

    const tree = document.createElement("div");
    tree.className = "classification-map-tree";
    for (const sector of classificationMap.sectors ?? []) {
        const sectorTarget = requestedLevel === "sector" && sector.code === requestedCode;
        const sectorRow = document.createElement("div");
        sectorRow.className = "classification-map-sector-row";

        const sectorDetails = document.createElement("details");
        const sectorHeading = document.createElement("summary");
        appendClassificationMapLabel(sectorHeading, sector, classificationMap, "valuechains");
        sectorHeading.append(` · ${sector.groups.length} groups`);
        sectorDetails.appendChild(sectorHeading);
        if (sectorTarget) {
            sectorDetails.open = true;
            selectedElement = sectorHeading;
        }

        const sectorActions = document.createElement("div");
        sectorActions.className = "classification-map-sector-actions";
        for (const [label, expand] of [["+", true], ["−", false]]) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "classification-map-action";
            button.textContent = label;
            const sectorName = sector.name?.ko || sector.code;
            button.title = `${expand ? "Expand" : "Collapse"} ${sectorName}`;
            button.setAttribute("aria-label", button.title);
            button.addEventListener("click", () => {
                sectorDetails.open = expand;
                sectorDetails.querySelectorAll("details").forEach(details => {
                    details.open = expand;
                });
            });
            sectorActions.appendChild(button);
        }
        sectorRow.appendChild(sectorDetails);
        sectorRow.appendChild(sectorActions);

        for (const group of sector.groups) {
            const groupTarget = requestedLevel === "group" && group.code === requestedCode;
            const groupDetails = document.createElement("details");
            const groupHeading = document.createElement("summary");
            appendClassificationMapLabel(groupHeading, group, classificationMap, "valuechains");
            groupHeading.append(` · ${group.industries.length} industries`);
            groupDetails.appendChild(groupHeading);
            if (sectorTarget || groupTarget) sectorDetails.open = true;
            if (groupTarget) {
                groupDetails.open = true;
                selectedElement = groupHeading;
            }

            for (const industry of group.industries) {
                const industryTarget = requestedLevel === "industry" && industry.code === requestedCode;
                const industryDetails = document.createElement("details");
                const industryHeading = document.createElement("summary");
                appendClassificationMapLabel(industryHeading, industry, classificationMap, "valuechains");
                industryHeading.append(` · ${industry.subindustries.length} subindustries`);
                industryDetails.appendChild(industryHeading);
                appendClassificationMapDefinition(industryDetails, industry.definition);
                if (industryTarget) {
                    sectorDetails.open = true;
                    groupDetails.open = true;
                    industryDetails.open = true;
                    selectedElement = industryHeading;
                }

                for (const subindustry of industry.subindustries) {
                    const subindustryBlock = document.createElement("section");
                    subindustryBlock.className = "classification-map-subindustry";
                    const subindustryHeading = document.createElement("p");
                    subindustryHeading.className = "classification-map-subindustry-heading";
                    appendClassificationMapLabel(subindustryHeading, subindustry, classificationMap, "components");
                    subindustryHeading.append(` · ${(subindustry.companies ?? []).length} companies`);
                    subindustryBlock.appendChild(subindustryHeading);
                    appendClassificationMapDefinition(subindustryBlock, subindustry.definition);
                    const companies = Array.isArray(subindustry.companies) ? subindustry.companies : [];
                    const members = document.createElement("details");
                    members.className = "classification-map-members";
                    const membersHeading = document.createElement("summary");
                    membersHeading.textContent = `${companies.length} companies`;
                    members.appendChild(membersHeading);
                    const memberList = document.createElement("ul");
                    for (const code of companies) {
                        const item = document.createElement("li");
                        const link = document.createElement("a");
                        const page = classificationMap.company_pages?.[code];
                        link.href = page ? `/build/profiles/${encodeURIComponent(page)}.html` : "#";
                        if (page) {
                            link.target = "_blank";
                            link.rel = "noopener";
                        }
                        link.textContent = `${classificationMap.company_names?.[code] || code.replace(/\([A-Za-z]\)$/, "")}(${code})`;
                        if (!page) {
                            link.removeAttribute("href");
                            link.title = "Profile page not found";
                        }
                        item.appendChild(link);
                        memberList.appendChild(item);
                    }
                    members.appendChild(memberList);
                    if (requestedLevel === "subindustry" && subindustry.code === requestedCode) {
                        members.open = true;
                    }
                    subindustryBlock.appendChild(members);
                    if (requestedLevel === "subindustry" && subindustry.code === requestedCode) {
                        sectorDetails.open = true;
                        groupDetails.open = true;
                        industryDetails.open = true;
                        selectedElement = subindustryBlock;
                    }
                    industryDetails.appendChild(subindustryBlock);
                }
                groupDetails.appendChild(industryDetails);
            }
            sectorDetails.appendChild(groupDetails);
        }
        tree.appendChild(sectorRow);
    }
    for (const [label, expand] of [["+", true], ["−", false]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "classification-map-action";
        button.textContent = label;
        button.title = expand ? "Expand all" : "Collapse all";
        button.setAttribute("aria-label", button.title);
        button.addEventListener("click", () => {
            tree.querySelectorAll("details").forEach(details => {
                details.open = expand;
            });
        });
        actions.appendChild(button);
    }
    article.appendChild(actions);
    article.appendChild(tree);
    if (selectedElement) {
        requestAnimationFrame(() => selectedElement.scrollIntoView({ block: "center" }));
    }
}

async function showClassificationMap() {
    hideSearchHelp();
    const loadId = ++manualLoadId;
    currentSection = "";
    currentItems = [];
    renderListActions();
    hideListPlot();
    document.getElementById("file-list").replaceChildren();

    const content = document.getElementById("content");
    const article = document.createElement("article");
    article.className = "manual-content";
    article.textContent = "Loading classification map…";
    content.replaceChildren(article);

    try {
        const response = await fetch("/api/classification-map");
        if (!response.ok) throw new Error("Could not load the classification map.");
        const classificationMap = await response.json();
        if (loadId !== manualLoadId) return;
        renderClassificationMap(article, classificationMap);
    } catch (error) {
        if (loadId !== manualLoadId) return;
        article.textContent = error.message || "Could not load the classification map.";
    }
}


function renderSection() {
    const search = document.getElementById("search").value.trim().toLowerCase();
    const list = document.getElementById("file-list");

    list.replaceChildren();

    if (currentSection === "profiles") {
        renderProfileGroups(search, list);
        return;
    }

    if (currentSection === "components" || currentSection === "valuechains") {
        renderScopedItems(search, list);
        return;
    }

    for (const item of currentItems) {
        if (!item.text.toLowerCase().normalize("NFC").includes(search)) {
            continue;
        }

        list.appendChild(createModelLink(currentSection, item));
    }
}

function renderScopeGroup(label, count, section, list, renderItems, openForSearch = false) {
    const details = document.createElement("details");
    details.className = "profile-scope-group";
    const expanded = getExpandedScopes(section);
    details.open = expanded.has(label) || openForSearch;
    let ignoreInitialToggle = openForSearch && !expanded.has(label);
    details.addEventListener("toggle", () => {
        if (ignoreInitialToggle) {
            ignoreInitialToggle = false;
            return;
        }
        if (details.open) expanded.add(label);
        else expanded.delete(label);
    });

    const heading = document.createElement("summary");
    heading.textContent = `${label} (${count})`;
    details.appendChild(heading);
    const items = document.createElement("div");
    items.className = "profile-scope-items";
    renderItems(items);
    details.appendChild(items);
    list.appendChild(details);
}

function renderProfileGroups(search, list) {
    const groups = new Map();
    for (const item of currentItems) {
        if (!groups.has(item.profileGroupKey)) {
            groups.set(item.profileGroupKey, {
                profileName: item.profileName,
                items: [],
            });
        }
        groups.get(item.profileGroupKey).items.push(item);
    }

    const groupedByScope = new Map();
    for (const group of groups.values()) {
        let matchingItems = group.items.filter(item =>
            item.text.toLowerCase().normalize("NFC").includes(search.normalize("NFC"))
        );
        if (matchingItems.length === 0) continue;

        // Keep the parent profile visible when the query matches one of its segments.
        const parent = group.items.find(item => !item.isSegment);
        if (parent && matchingItems.some(item => item.isSegment) && !matchingItems.includes(parent)) {
            matchingItems = [parent, ...matchingItems];
        }

        const scope = getListScope(group.profileName, "profiles");
        if (!groupedByScope.has(scope)) groupedByScope.set(scope, []);
        groupedByScope.get(scope).push(matchingItems);
    }

    const scopeLabels = [...(listScopes?.profiles ?? []), "Others"];
    for (const label of scopeLabels) {
        const profileGroups = groupedByScope.get(label);
        if (!profileGroups?.length) continue;

        const profileCount = profileGroups.reduce(
            (count, profileItems) => count + Number(profileItems.some(item => !item.isSegment)),
            0,
        );
        renderScopeGroup(label, profileCount, "profiles", list, items => {
            for (const profileItems of profileGroups) {
                for (const item of profileItems) {
                    items.appendChild(createModelLink("profiles", item));
                }
            }
        }, Boolean(search));
    }
}

function renderScopedItems(search, list) {
    const grouped = new Map();
    for (const item of currentItems) {
        if (!item.text.toLowerCase().normalize("NFC").includes(search.normalize("NFC"))) continue;
        const scope = getListScope(item.text, currentSection);
        if (!grouped.has(scope)) grouped.set(scope, []);
        grouped.get(scope).push(item);
    }

    for (const label of [...(listScopes?.[currentSection] ?? []), "Others"]) {
        const items = grouped.get(label);
        if (!items?.length) continue;
        renderScopeGroup(label, items.length, currentSection, list, container => {
            for (const item of items) container.appendChild(createModelLink(currentSection, item));
        }, Boolean(search));
    }
}

function createModelLink(section, item) {
    const link = document.createElement("a");
    link.href = `/build/${section}/${item.file}`;
    link.textContent = item.text;
    if (section === "profiles") {
        const code = item.file.replace(/\.html$/, "").split("_")[0];
        link.dataset.profileCode = code;
        link.dataset.profileSegment = String(item.isSegment ?? false);
        link.dataset.profileName = item.profileName ?? item.text.replace(/\s+\([^)]*\)$/, "");
    }
    if (!item.reviewed) {
        link.classList.add("unreviewed-model");
        if (item.isSegment) link.classList.add("unreviewed-segment");
        else if (item.recommended) link.classList.add("recommended-profile");
    }
    return link;
}

// Show a non-interactive page preview beside hovered search results.
const preview = document.createElement("div");
preview.className = "result-preview";
preview.setAttribute("aria-hidden", "true");
preview.innerHTML = '<iframe title="Page preview" tabindex="-1" sandbox="allow-scripts allow-same-origin"></iframe>';
document.body.appendChild(preview);
const previewFrame = preview.querySelector("iframe");
let previewLink = null;

function hidePreview() {
    previewLink = null;
    preview.classList.remove("visible");
}

document.addEventListener("pointerover", event => {
    if (document.activeElement === document.getElementById("search")) return;
    const link = event.target.closest("#file-list a");
    if (!link || link === previewLink || event.pointerType === "touch") return;
    previewLink = link;
    previewFrame.src = link.href;
    preview.classList.add("visible");
});

document.addEventListener("pointerout", event => {
    const link = event.target.closest("#file-list a");
    if (link && !link.contains(event.relatedTarget)) {
        hidePreview();
    }
});

// The preview can cover the search box while the pointer stays over a result.
document.getElementById("search").addEventListener("focus", hidePreview);


let searchRequest = 0;
async function showMainSearch(queryOverride = null) {
    hideListPlot();
    const request = ++searchRequest;
    const search = (queryOverride ?? document.getElementById("search").value)
        .trim().toLowerCase().normalize("NFC");
    const list = document.getElementById("file-list");

    list.replaceChildren();

    if (!search) {
        return 0;
    }

    const isTagQuery = search.startsWith("#");
    if (search === "#tags") {
        const response = await fetch("/api/tag-index");
        if (!response.ok) throw new Error("Failed to load tags");
        const tagIndex = await response.json();
        if (request !== searchRequest) return -1;

        const allTags = new Map();
        for (const entry of tagIndex) {
            for (const tag of (entry.tags ?? "").match(/#[\p{L}\p{N}_]+/gu) ?? []) {
                const normalized = tag.slice(1).toLowerCase().normalize("NFC");
                if (normalized) allTags.set(normalized, tag);
            }
        }
        const message = document.createElement("div");
        message.className = "search-message";
        message.textContent = `All tags (${allTags.size}):`;
        list.appendChild(message);
        const tagList = document.createElement("div");
        tagList.className = "tag-list";
        for (const tag of [...allTags.values()].sort((a, b) => a.localeCompare(b, "ko"))) {
            const link = document.createElement("a");
            link.href = `/?q=${encodeURIComponent(tag)}`;
            link.textContent = tag;
            link.addEventListener("click", event => {
                event.preventDefault();
                const searchBox = document.getElementById("search");
                searchBox.value = tag;
                showMainSearch(tag);
            });
            tagList.appendChild(link);
        }
        list.appendChild(tagList);
        lastTagSearchQuery = search;
        return allTags.size;
    }
    const tagQuery = search.slice(1).match(/^[\p{L}\p{N}_]+/u)?.[0] ?? "";
    if (isTagQuery) {
        if (!tagQuery) return 0;
        const response = await fetch("/api/tag-index");
        if (!response.ok) {
            throw new Error("Failed to load tags");
        }
        const tagIndex = await response.json();
        const sectionMatches = [];

        for (const [section, title] of Object.entries(sections)) {
            const items = await getItems(section);
            if (request !== searchRequest) return -1;

            const tagsByFile = new Map(
                tagIndex
                    .filter(entry => entry.section === section)
                    .map(entry => [entry.file, entry.tags])
            );
            const matches = items.filter(item => {
                const tags = (tagsByFile.get(item.file) ?? "")
                    .match(/#[\p{L}\p{N}_]+/gu) ?? [];
                const normalizedTags = tags.map(tag =>
                    tag.slice(1).toLowerCase().normalize("NFC")
                );
                return normalizedTags.includes(tagQuery.toLowerCase().normalize("NFC"));
            });

            if (matches.length > 0) sectionMatches.push({ section, title, matches });
        }

        if (request === searchRequest) {
            lastTagSearchQuery = search;
            const message = document.createElement("div");
            message.className = "search-message";
            const hint = document.createElement("span");
            hint.className = "tag-search-hint";
            hint.textContent = "to list all tags, enter #tags";
            list.appendChild(hint);
            message.textContent = sectionMatches.length > 0
                ? `tag search result of #${tagQuery}:`
                : `tag search result of #${tagQuery}: none found`;
            list.appendChild(message);

            for (const { section, title, matches } of sectionMatches) {
                const heading = document.createElement("div");
                heading.className = "search-section";
                heading.textContent = `${section === "profiles" ? "Profile" : section === "valuechains" ? "Valuechain" : title}:`;
                list.appendChild(heading);

                for (const item of matches) {
                    list.appendChild(createModelLink(section, item));
                }
            }
            return sectionMatches.reduce((total, section) => total + section.matches.length, 0);
        }
        return -1;
    }

    let matchCount = 0;
    for (const [section, title] of Object.entries(sections)) {
        const items = await getItems(section);
        // A newer search has started
        if (request !== searchRequest) {
            return -1;
        }
        const matches = items.filter(item =>
            item.text.toLowerCase().normalize("NFC").includes(search)
        );

        if (matches.length === 0) {
            continue;
        }
        matchCount += matches.length;

        const heading = document.createElement("div");
        heading.className = "search-section";
        heading.textContent = `${title}:`;

        list.appendChild(heading);

        for (const item of matches) {
            list.appendChild(createModelLink(section, item));
        }
    }
    return matchCount;
}

async function getPublicCompanyProfile(query) {
    const list = document.getElementById("file-list");
    const hideProgress = window.showPythonProgress("Checking public company and creating profile…");
    try {
        const response = await fetch("/api/get-item", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, progressId: hideProgress.progressId }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) {
            throw new Error(result.error || "No matching item or public company found.");
        }
        window.location.href = `/build/profiles/${encodeURIComponent(result.file)}`;
    } catch (error) {
        list.replaceChildren();
        const message = document.createElement("div");
        message.className = "search-message";
        message.textContent = error.message || "Could not get item.";
        list.appendChild(message);
    } finally {
        hideProgress();
    }
}

// Navigation is supplied by the shared navbar.js. Delegate clicks so the
// handler also works when the shared menu is added after this script loads.
document.addEventListener("click", event => {
    const link = event.target.closest(".nav-link");
    if (!link) return;

    const section = link.dataset.section;
    if (section === "QP") return;

    if (section === "manual") {
        event.preventDefault();
        document.querySelectorAll(".navbar .nav-dropdown[open]").forEach(menu => menu.removeAttribute("open"));
        history.pushState(null, "", "/#manual");
        document.getElementById("search").value = "";
        showManual();
        return;
    }

    if (section === "classification-map") {
        event.preventDefault();
        document.querySelectorAll(".navbar .nav-dropdown[open]").forEach(menu => menu.removeAttribute("open"));
        history.pushState(null, "", "/#classification-map");
        document.getElementById("search").value = "";
        showClassificationMap();
        return;
    }

    if (!sections[section]) return;

    event.preventDefault();
    history.pushState(null, "", "/#" + section);
    document.getElementById("search").value = "";
    showFiles(section);
});


// Search box
document.getElementById("search").addEventListener("input", () => {
    hideSearchHelp();
    const query = document.getElementById("search").value.trim();
    const listSection = location.hash.slice(1);
    if (["profiles", "components", "valuechains"].includes(listSection) && !query) {
        showListPlot(listSection);
    } else {
        hideListPlot();
    }
    if (query.startsWith("#")) {
        lastTagSearchQuery = "";
        document.getElementById("file-list").replaceChildren();
        return;
    }

    if (location.hash) {
        renderSection();
    } else {
        showMainSearch();
    }
});


// Enter searches the query, then tries the public-company lookup if no item matched.
document.getElementById("search").addEventListener("keydown", event => {
    // Korean IMEs use Enter to commit the current syllable. Do not treat that
    // composition keystroke as a search submission.
    if (event.isComposing || event.keyCode === 229) {
        return;
    }
    if (event.key !== "Enter") {
        return;
    }
    event.preventDefault();

    const query = document.getElementById("search").value.trim();
    if (!query) {
        const links = document.querySelectorAll("#file-list a");
        if (links.length === 1) links[0].click();
        return;
    }

    if (query.startsWith("#") && lastTagSearchQuery !== query) {
        document.getElementById("search").value = "";
        showMainSearch(query);
        return;
    }

    if (query.startsWith("#")) return;

    showMainSearch(query).then(matches => {
        const links = [...document.querySelectorAll("#file-list a")];
        const normalizedQuery = query.toLowerCase().normalize("NFC");
        const exactLabelMatches = links.filter(link =>
            link.textContent.trim().toLowerCase().normalize("NFC") === normalizedQuery
        );
        const exactBaseCodeMatches = links.filter(link =>
            link.dataset.profileCode?.toLowerCase() === normalizedQuery
            && link.dataset.profileSegment !== "true"
        );
        const exactBaseNameMatches = links.filter(link =>
            link.dataset.profileName?.toLowerCase().normalize("NFC") === normalizedQuery
            && link.dataset.profileSegment !== "true"
        );
        const exactSegmentCodeMatches = links.filter(link =>
            link.dataset.profileCode?.toLowerCase() === normalizedQuery
            && link.dataset.profileSegment === "true"
        );
        const exactMatches = exactBaseCodeMatches.length
            ? exactBaseCodeMatches
            : exactBaseNameMatches.length
                ? exactBaseNameMatches
                : exactLabelMatches.length
                    ? exactLabelMatches
                    : exactSegmentCodeMatches;

        if (exactMatches.length === 1) {
            exactMatches[0].click();
        } else if (matches === 1) {
            links[0]?.click();
        } else if (matches === 0) {
            getPublicCompanyProfile(query);
        }
    });
});

// "/" → focus search
document.addEventListener("keydown", event => {
    if (
        event.key === "/" &&
        document.activeElement !== document.getElementById("search") &&
        !event.target.matches("input, textarea, [contenteditable='true']")
    ) {
        event.preventDefault();

        const search = document.getElementById("search");
        history.pushState(null, "", "/");
        search.value = "";
        currentSection = "";
        currentItems = [];
        renderListActions();
        searchRequest += 1;
        lastTagSearchQuery = "";
        hideListPlot();
        document.getElementById("file-list").replaceChildren();
        document.getElementById("content").replaceChildren();
        showSearchHelp();
        search.focus();
    }
});

document.addEventListener("DOMContentLoaded", () => {
    if (new URLSearchParams(location.search).get("focus") === "search") {
        showSearchHelp();
        document.getElementById("search").focus();
    }
});

// Initial page
const section = location.hash.slice(1);

if (section === "manual") {
    showManual();
} else if (section === "classification-map") {
    showClassificationMap();
} else if (section && sections[section]) {
    showFiles(section);
}
const initialQuery = new URLSearchParams(location.search).get("q");
if (initialQuery) {
    const search = document.getElementById("search");
    search.value = initialQuery;
    showMainSearch();
    search.focus();
}
