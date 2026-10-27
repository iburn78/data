let currentSection = "";
let currentItems = [];
let lastTagSearchQuery = "";
let profilePlotLoadId = 0;
let plotlyLoadPromise = null;

function hideProfilePlot() {
    profilePlotLoadId += 1;
    document.getElementById("profile-plot").hidden = true;
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

async function showProfilePlot() {
    const plot = document.getElementById("profile-plot");
    const loadId = ++profilePlotLoadId;
    plot.hidden = false;
    if (!plot.dataset.ready) plot.textContent = "Loading profile plot…";

    try {
        const [response] = await Promise.all([
            fetch("/api/profile-plot"),
            loadPlotly(),
        ]);
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.error || `Could not load profile plot data (HTTP ${response.status}).`);
        }
        const { points, category_colors: colors, per_bound: perBound } = await response.json();
        if (loadId !== profilePlotLoadId || plot.hidden) return;

        const pointsByCoordinates = new Map();
        for (const point of points) {
            const key = `${point.opmargin_4qtrs}\u0000${point.PER_ltm}`;
            if (!pointsByCoordinates.has(key)) pointsByCoordinates.set(key, []);
            pointsByCoordinates.get(key).push(point);
        }
        const labelOffsets = new Map();
        for (const samePosition of pointsByCoordinates.values()) {
            samePosition.sort((a, b) => a.label.localeCompare(b.label));
            samePosition.forEach((point, index) => {
                if (samePosition.length === 1) {
                    labelOffsets.set(point, { xshift: 0, yshift: 14, xanchor: "center" });
                    return;
                }
                const column = index % 2;
                const row = Math.floor(index / 2);
                let verticalDirection = point.PER_ltm >= perBound * 0.85 ? -1 : 1;
                if (point.PER_ltm <= perBound * 0.1) verticalDirection = 1;
                labelOffsets.set(point, {
                    xshift: (column === 0 ? -1 : 1) * (12 + row * 2),
                    yshift: verticalDirection * (14 + row * 20),
                    xanchor: column === 0 ? "right" : "left",
                });
            });
        }
        const annotations = points.map(point => ({
            x: point.opmargin_4qtrs,
            y: point.PER_ltm,
            xref: "x",
            yref: "y",
            text: point.label,
            name: `${point.category}::${point.page_url}`,
            showarrow: false,
            captureevents: true,
            ...labelOffsets.get(point),
            font: { color: colors[point.category], weight: 400 },
        }));

        const traces = ["A", "B", "C", "D"].map(category => {
            const categoryPoints = points.filter(point => point.category === category);
            return {
                type: "scatter",
                mode: "markers",
                name: category,
                x: categoryPoints.map(point => point.opmargin_4qtrs),
                y: categoryPoints.map(point => point.PER_ltm),
                text: categoryPoints.map(point => point.label),
                customdata: categoryPoints.map(point => [point.page_url, point.code]),
                marker: { color: colors[category], size: 10, opacity: 0.85 },
                hovertemplate: "%{text}<br>Code: %{customdata[1]}<br>"
                    + "Operating margin: %{x:.1%}<br>PER (LTM): %{y:.2f}"
                    + "<extra>" + category + "</extra>",
            };
        });

        if (!plot.dataset.ready) plot.replaceChildren();
        await window.Plotly.react(plot, traces, {
            title: "Profile and segment operating margin vs. LTM PER",
            template: "plotly_white",
            margin: { t: 55, r: 25, b: 90, l: 95 },
            annotations,
            xaxis: {
                title: { text: "X: Operating margin (4 quarters)", standoff: 14 },
                tickformat: ".0%",
                automargin: true,
            },
            yaxis: {
                title: { text: "Y: PER (LTM)", standoff: 14 },
                range: [0, perBound],
                automargin: true,
            },
            legend: { title: { text: "Category" }, itemclick: "toggle",
                itemdoubleclick: false },
            clickmode: "event",
        }, { responsive: true });
        if (loadId !== profilePlotLoadId || plot.hidden) return;
        plot.dataset.ready = "true";

        plot.removeAllListeners?.("plotly_clickannotation");
        plot.removeAllListeners?.("plotly_legendclick");
        plot.on("plotly_clickannotation", event => {
            const name = event.annotation?.name || "";
            const url = name.slice(name.indexOf("::") + 2);
            if (url) window.open(new URL(url, location.origin), "_blank", "noopener");
        });
        const categoryVisibility = new Map(traces.map(trace => [trace.name, true]));
        plot.on("plotly_legendclick", event => {
            const category = traces[event.curveNumber]?.name;
            if (!category) return;
            const visible = !categoryVisibility.get(category);
            categoryVisibility.set(category, visible);
            setTimeout(() => {
                const nextAnnotations = annotations.map(annotation =>
                    annotation.name.startsWith(`${category}::`)
                        ? { ...annotation, visible }
                        : annotation
                );
                window.Plotly.relayout(plot, { annotations: nextAnnotations });
            }, 0);
        });
    } catch (error) {
        if (loadId !== profilePlotLoadId) return;
        plot.textContent = error.message || "Could not load profile plot.";
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
        const { file, reviewed = false } = typeof entry === "string"
            ? { file: entry, reviewed: true }
            : entry;
        let text = file.replace(".html", "");

        if (section === "profiles") {
            const [code, ...name] = text.split("_");
            text = `${name.join(" ")} (${code})`;
        } else {
            text = text.replaceAll("_", " ");
        }

        return { file, text, reviewed };
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

        return [
            ...(group.profile ? [group.profile] : []),
            ...group.segments.map(segment => segment.item),
        ];
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
    currentSection = section;
    if (section === "profiles" && !document.getElementById("search").value.trim()) {
        showProfilePlot();
    } else {
        hideProfilePlot();
    }
    currentItems = await getItems(section);

    renderSection();
}


function renderSection() {
    const search = document.getElementById("search").value.trim().toLowerCase();
    const list = document.getElementById("file-list");

    list.replaceChildren();

    for (const item of currentItems) {
        if (!item.text.toLowerCase().normalize("NFC").includes(search)) {
            continue;
        }

        list.appendChild(createModelLink(currentSection, item));
    }
}

function createModelLink(section, item) {
    const link = document.createElement("a");
    link.href = `/build/${section}/${item.file}`;
    link.textContent = item.text;
    if (!item.reviewed) {
        link.classList.add("unreviewed-model");
        if (item.isSegment) link.classList.add("unreviewed-segment");
    }
    return link;
}

// Show a non-interactive page preview beside hovered search results.
const preview = document.createElement("div");
preview.className = "result-preview";
preview.setAttribute("aria-hidden", "true");
preview.innerHTML = '<iframe title="Page preview" tabindex="-1" sandbox=""></iframe>';
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
    hideProfilePlot();
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
    if (section === "QP" || !sections[section]) return;

    event.preventDefault();
    history.pushState(null, "", "/#" + section);
    document.getElementById("search").value = "";
    showFiles(section);
});


// Search box
document.getElementById("search").addEventListener("input", () => {
    const query = document.getElementById("search").value.trim();
    if (location.hash === "#profiles" && !query) {
        showProfilePlot();
    } else {
        hideProfilePlot();
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
        if (matches === 1) {
            document.querySelector("#file-list a")?.click();
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
        document.getElementById("search").focus();
    }
});

document.addEventListener("DOMContentLoaded", () => {
    if (new URLSearchParams(location.search).get("focus") === "search") {
        document.getElementById("search").focus();
    }
});

// Initial page
const section = location.hash.slice(1);

if (section && sections[section]) {
    showFiles(section);
}
const initialQuery = new URLSearchParams(location.search).get("q");
if (initialQuery) {
    const search = document.getElementById("search");
    search.value = initialQuery;
    showMainSearch();
    search.focus();
}
