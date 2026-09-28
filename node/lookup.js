function componentName(component) {
    return component.key ?? component.name;
}

function memberCode(member) {
    // Current Python model: key is either "005930" or "005930(A)".
    // Older generated JSON stored the company code in `code`.
    const key = member.key ?? member.code;
    return typeof key === "string"
        ? key.replace(/\([A-Za-z]\)$/, "")
        : null;
}

function getComponents(code, components) {
    return components
        .filter(component =>
            (component.members ?? component.companies ?? []).some(member =>
                memberCode(member) === code
            )
        )
        .map(componentName);
}

function getComponentsForMember(key, components) {
    return components
        .filter(component =>
            (component.members ?? component.companies ?? []).some(member =>
                (member.key ?? member.code) === key
            )
        )
        .map(componentName);
}

function getValuechains(name, valuechains) {
    return valuechains
        .filter(valuechain =>
            (valuechain.component_keys ?? valuechain.component_names ?? []).includes(name)
        )
        .map(valuechain => valuechain.key ?? valuechain.name);
}

module.exports = {
    getComponents,
    getComponentsForMember,
    getValuechains,
};
