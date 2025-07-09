export const nodes = [
    { id: 's0', x: 50, y: 100 },
    { id: 's1', x: 200, y: 50 },
    { id: 's2', x: 200, y: 150 },
    { id: 's3', x: 350, y: 50 },
    { id: 's4', x: 350, y: 150 },
    { id: 's5', x: 400, y: 250 },
    { id: 's6', x: 500, y: 50 },
    { id: 's7', x: 500, y: 150 },
    { id: 's8', x: 650, y: 50 },
    { id: 's9', x: 650, y: 150 },
    { id: 'x5', x: 500, y: 300, final: true },
    { id: 'x7', x: 600, y: 250, final: true },
    { id: 'x8', x: 750, y: 100, final: true },
    { id: 'x9', x: 750, y: 200, final: true },
  ];

export const edges = [
    { from: 's0', to: 's1', flow: 2 },
    { from: 's0', to: 's2', flow: 8 },
    { from: 's1', to: 's3', flow: 2 },
    { from: 's2', to: 's3', flow: 1 },
    { from: 's2', to: 's4', flow: 5 },
    { from: 's2', to: 's5', flow: 2 },
    { from: 's3', to: 's6', flow: 3 },
    { from: 's4', to: 's5', flow: 1 },
    { from: 's4', to: 's7', flow: 4 },
    { from: 's5', to: 'x5', flow: 3 },
    { from: 's6', to: 's9', flow: 2 },
    { from: 's6', to: 's8', flow: 1 },
    { from: 's7', to: 's9', flow: 3 },
    { from: 's7', to: 'x7', flow: 1 },
    { from: 's9', to: 'x9', flow: 5 },
    { from: 's8', to: 'x8', flow: 1 }
  ];

export function nodeById(id) {
    return nodes.find(n => n.id === id);
}

export function edgeById(id_from, id_to) {
    return edges.find(n => n.from === id_from && n.to === id_to);
}

export function previousStatesFormula(nodeId) {
    let out = edges
      .filter(e => e.to === nodeId)
      .map(e => `F(s_${e.from[1]} \\to ${e.to[0]}_${e.to[1]})`)
      .join(' + ');
    if (out === "") out = "Z";
    return out;
}

export function nextStatesFormula(nodeId) {
    let out = edges
      .filter(e => e.from === nodeId)
      .map(e => `F(s_${e.from[1]} \\to ${e.to[0]}_${e.to[1]})`)
      .join(' + ');
    if(out === "") out = `R(x_${nodeId[1]})`;
    return out;
}

export function policyFormula(edge) {
    let out = edges
      .filter(e => e.from === edge.from).filter(e => e.to !== edge.to)
      .map(e => `F(s_${e.from[1]} \\to ${e.to[0]}_${e.to[1]})`)
      .join(' + ');
    if (out !== "") {
      out = "+" + out;
    }
    return out;
}

export function previousStatesValues(nodeId) {
    let out = edges
      .filter(e => e.to === nodeId)
      .map(e => `${e.flow}`)
      .join(' + ');
    if (out === ""){
      out = "10";
    } else if (out.includes("+")){
      out = out + `= ${edges.filter(e => e.to === nodeId).reduce((sum, e) => sum + e.flow, 0)}`}
    return out;
}

export function nextStatesValues(nodeId) {
    let out = edges
      .filter(e => e.from === nodeId)
      .map(e => `${e.flow}`)
      .join(' + ');
    if(out === "") {
      out = previousStatesValues(nodeId);
    } else if (out.includes("+")){
      out = out + `= ${edges.filter(e => e.from === nodeId).reduce((sum, e) => sum + e.flow, 0)}`}
    return out;
}

export function policyValue(edge) {
    let prob = (edge.flow / edges
    .filter(e => e.from === edge.from)
    .reduce((sum, e) => sum + e.flow, 0))
    .toFixed(2);
    let out = edges
      .filter(e => e.from === edge.from).filter(e => e.to !== edge.to)
      .map(e => `${e.flow}`)
      .join(' + ');
    if(out === "") {
      out = `\\frac{${edge.flow}}{${edge.flow}} = ${prob} `
    } else{
      out = `\\frac{${edge.flow}}{${edge.flow} + ${out}} = ${prob} `
    }
    return out;
}

export function lossValue(nodeId){
    let numerator = edges
      .filter(e => e.to === nodeId)
      .map(e => `${e.flow}`)
      .join(' + ');
    let denominator = edges
      .filter(e => e.from === nodeId)
      .map(e => `${e.flow}`)
      .join(' + ');
    if (denominator ==="") denominator = numerator;
    if (numerator === "") numerator = "10";
    return `\\left( \\log \\frac{${numerator}}{${denominator}} \\right)^2 = 0`
}