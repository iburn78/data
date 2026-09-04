function getComponents(code, components) {
    return components
        .filter(component =>
            component.companies.some(company =>
                company.code === code
            )
        )
        .map(component => component.name);
}

function getValuechains(name, valuechains) {
    return valuechains
        .filter(valuechain =>
            valuechain.component_names.includes(name)
        )
        .map(valuechain => valuechain.name);
}

module.exports = {
    getComponents,
    getValuechains,
};