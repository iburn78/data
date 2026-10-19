function relationTarget(model) {
    const name = model.key ?? model.name;
    const file = model.filename ?? name;
    return { name, file };
}

function listedCompanyCode(listedCompany) {
    // Current Python model: key is either "005930" or "005930(A)".
    // Older generated JSON stored the company code in `code`.
    const key = listedCompany.key ?? listedCompany.code;
    return typeof key === "string"
        ? key.replace(/\([A-Za-z]\)$/, "")
        : null;
}

function getComponents(code, components) {
    return components
        .filter(component =>
            (component.listed_companies ?? []).some(listedCompany =>
                listedCompanyCode(listedCompany) === code
            )
        )
        .map(relationTarget);
}

function getComponentsForMember(key, components) {
    return components
        .filter(component =>
            (component.listed_companies ?? []).some(listedCompany =>
                (listedCompany.key ?? listedCompany.code) === key
            )
        )
        .map(relationTarget);
}

function getValuechains(name, valuechains) {
    return valuechains
        .filter(valuechain =>
            (valuechain.component_keys ?? valuechain.component_names ?? []).includes(name)
        )
        .map(relationTarget);
}

module.exports = {
    getComponents,
    getComponentsForMember,
    getValuechains,
};
