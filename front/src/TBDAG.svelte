<script>
  // Fig. 9: example DAG for trajectory balance. Select a trajectory to see P_F, P_B and the loss.
  import Katex from 'svelte-katex';
  import { nodes, edges, nodeById, edgeById } from './DAG.js';

  // initial trajectory, e.g. ['s0', 's2', 's4', 's7', 's9', 'x9']; ['s0'] = nothing selected
  export let path = ['s0'];
  // show the figure caption (article)
  export let caption = true;
  let TB_path = path;
  let TB_trajectory_complete = nodes.find(n => n.id === path.at(-1))?.final ?? false;

  function TB_nodeById(id) {
    return nodes.find(n => n.id === id);
  }

  function TB_outgoingEdges(nodeId) {
    return edges.filter(e => e.from === nodeId);
  }

  function TB_isActive(nodeId) {
    if (TB_path.length === 0 && nodeId === 's0') return true;
    const last = TB_path[TB_path.length - 1];
    return TB_outgoingEdges(last).some(e => e.to === nodeId);
  }

  function TB_handleClick(nodeId) {
    if (TB_trajectory_complete && !TB_path.includes(nodeId)) return;

    const indexInPath = TB_path.indexOf(nodeId);

    if (indexInPath !== -1) {
      // Node already in path: trim back to this point
      TB_path = TB_path.slice(0, indexInPath + 1);
      TB_trajectory_complete = TB_nodeById(nodeId)?.final ?? false;
      return;
    }

    const last = TB_path[TB_path.length - 1];
    const validNext = TB_outgoingEdges(last).some(e => e.to === nodeId);

    if (validNext) {
      TB_path = [...TB_path, nodeId];
      const node = TB_nodeById(nodeId);
      if (node?.final) TB_trajectory_complete = true;
    }
  }


  let TB_nodeColors = {};
  let TB_edgeColors = {};
  $: TB_set_colors(TB_path);
  function TB_set_colors(path) {
    const newNodeColors = {};
    const newEdgeColors = {};

    for (const node of nodes) {
      if (path.includes(node.id)) {
        newNodeColors[node.id] = '#d95f02';
      } else if (TB_isActive(node.id)) {
        newNodeColors[node.id] = '#7570b3';
      } else {
        newNodeColors[node.id] = '#b8b8b8';
      }
    }

    for (const edge of edges) {
      const fromIndex = path.indexOf(edge.from);
      const toIndex = path.indexOf(edge.to);

      if (fromIndex !== -1 && toIndex === fromIndex + 1) {
        newEdgeColors[edge.from + '-' + edge.to] = '#d95f02';
      } else if (path.length && edge.from === path[path.length - 1]) {
        newEdgeColors[edge.from + '-' + edge.to] = '#7570b3';
      } else {
        newEdgeColors[edge.from + '-' + edge.to] = '#b8b8b8';
      }
    }

    TB_nodeColors = newNodeColors;
    TB_edgeColors = newEdgeColors;
  }

  let TB_current = {pf: 0, pb: 0, z:10};

  function TB_calculate_PF () {
    let form = "";
    let calc = "";
    let res = 1;
    for (let i = 0; i < TB_path.length-1; i++) {
      let edge = edgeById(TB_path[i],TB_path[i+1]);
      let denom = edges
        .filter(e => e.from === edge.from)
        .map(e => `${e.flow}`)
        .join(' + ');

      form = form + `P_F(${TB_path[i+1][0]}_${TB_path[i+1][1]}|${TB_path[i][0]}_${TB_path[i][1]})`;
      calc = calc + `\\frac{${edge.flow}}{${denom}}`
      if (i !== TB_path.length-2) {
        form = form + ` \\cdot `;
        calc = calc + ` \\cdot `;
      }
      res = res * (edge.flow / edges
        .filter(e => e.from === edge.from)
        .reduce((sum, e) => sum + e.flow, 0));
    }
    TB_current.pf =res.toFixed(3);
    return form + "= \\\\ =" + calc + "=" + TB_current.pf;
  }

  function TB_calculate_PB () {
    let form = "";
    let calc = "";
    let res = 1;
    for (let i = TB_path.length-1; i > 0; i--) {
      let edge = edgeById(TB_path[i-1],TB_path[i]);
      let denom = edges
        .filter(e => e.to === edge.to)
        .map(e => `${e.flow}`)
        .join(' + ');

      form = form + `P_B(${TB_path[i-1][0]}_${TB_path[i-1][1]}|${TB_path[i][0]}_${TB_path[i][1]})`;
      calc = calc + `\\frac{${edge.flow}}{${denom}}`
      if (i !== 1) {
        form = form + ` \\cdot `;
        calc = calc + ` \\cdot `;
      }
      res = res * (edge.flow / edges
        .filter(e => e.to === edge.to)
        .reduce((sum, e) => sum + e.flow, 0));

    }
    TB_current.pb =res.toFixed(3);
    return form + "= \\\\ =" + calc + "=" + TB_current.pb;
  }
</script>

<svg class="dag-svg" width="800" height="350" viewBox="0 0 800 350" style="display: block; margin: 20px auto;">
   <defs>
     <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5"
       markerWidth="6" markerHeight="6" orient="auto-start-reverse">
       <path d="M 0 0 L 10 5 L 0 10 z" fill="gray" />
     </marker>
   </defs>

   {#each edges as edge (edge.from + '-' + edge.to)}
     {#if TB_nodeById(edge.from) && TB_nodeById(edge.to)}
       <line
         x1="{TB_nodeById(edge.from).x}"
         y1="{TB_nodeById(edge.from).y}"
         x2="{TB_nodeById(edge.to).x}"
         y2="{TB_nodeById(edge.to).y}"
         stroke="{TB_edgeColors[edge.from + '-' + edge.to]}"
         stroke-width="2"
         marker-end="url(#arrow)"
       />
       <text
         x="{(nodeById(edge.from).x + nodeById(edge.to).x) / 2}"
         y="{(nodeById(edge.from).y + nodeById(edge.to).y) / 2 - 10}"
         text-anchor="middle"
         font-size="12"
         fill="black"
       >
         {edge.flow}
       </text>
       <!-- Particles -->
       <path
         id="path-{edge.from}-{edge.to}"
         d="M {nodeById(edge.from).x} {nodeById(edge.from).y}
            L {nodeById(edge.to).x} {nodeById(edge.to).y}"
         fill="none"
         stroke="transparent"
       />

       {#each Array(edge.flow) as _, i}
         <circle
           r="3"
           fill="{TB_edgeColors[edge.from + '-' + edge.to]}"
         >
           <animateMotion
             dur="{3 - i * 0.3}s"
             repeatCount="indefinite"
           >
             <mpath href="#path-{edge.from}-{edge.to}" />
           </animateMotion>
         </circle>
       {/each}
     {/if}
   {/each}

   {#each nodes as node}
     <g on:click={() => TB_handleClick(node.id)} style="cursor: pointer;" role="presentation">
       {#if node.id === 's0'}
         <polygon
           points="{node.x - 10},{node.y + 20} {node.x - 10},{node.y - 20} {node.x + 30},{node.y}"
           fill="{TB_nodeColors[node.id]}"
           stroke="black"
           stroke-width="1"
         />
       {:else if node.final}
         <rect
           x="{node.x - 20}"
           y="{node.y - 20}"
           width="40"
           height="40"
           rx="4"
           ry="4"
           fill="{TB_nodeColors[node.id]}"
           stroke="black"
           stroke-width="1"
         />
       {:else}
         <circle
           cx="{node.x}"
           cy="{node.y}"
           r="20"
           fill="{TB_nodeColors[node.id]}"
           stroke="black"
           stroke-width="1"
         />
       {/if}
       <text
         x="{node.x}"
         y="{node.y + 5}"
         text-anchor="middle"
         font-size="14"
         fill="black"
       >
         {node.id}
       </text>
       {#if node.final}
         <text x="{node.x}" y="{node.y + 36}" text-anchor="middle" font-size="12" fill="black">R = {node.reward}</text>
       {/if}
     </g>
   {/each}
 </svg>
 {#if caption}
<p class="mathexpl" style="color: white; width:750px;">
   Fig. 9: The same DAG as in Figure 8.
   To see the policy and loss calculations for a specific trajectory, choose a trajectory by selecting one of the purple states until you reach a final state.
   Reset by selecting s0 or another orange state.
 </p>
{/if}
 <table class="formula-table" style="width: 900px; border-collapse: collapse; margin: 20px auto; font-family: 'Georgia', serif; font-size: 16px;">
   <tbody>
       <tr>
         <td style="width: 130px; height: 110px; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #aaa; border-top: 2px solid white;">Forward policy</td>
         <td style="padding: 8px 0; border-bottom: 1px solid #aaa; border-top: 2px solid white;">
           {#if TB_trajectory_complete}
             <Katex>
               {`\\prod_t P_F(s_{t+1}|s_t) = ${TB_calculate_PF()}`}
             </Katex>
           {:else}
             <Katex>
               {`P_F(s'|s) = \\frac{F(s \\to s')}{\\sum_{s'' \\in children(s)} F(s \\to s'')}`}
             </Katex>
           {/if}
         </td>
       </tr>
       <tr>
         <td style="width: 130px; height: 100px; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #aaa;">Backward policy</td>
         <td style="padding: 8px 0; border-bottom: 1px solid #aaa;">
           {#if TB_trajectory_complete}
             <Katex>
               {`\\prod_t P_B(s_{t}|s_{t+1}) = ${TB_calculate_PB()}`}
             </Katex>
           {:else}
             <Katex>
               {`P_B(s|s') = \\frac{F(s \\to s')}{\\sum_{s'' \\in parents(s')} F(s'' \\to s')}`}
             </Katex>
           {/if}
         </td>
       </tr>
       <tr>
         <td style="width: 130px; height: 100px; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #aaa;">Loss</td>
         <td style="padding: 8px 0; border-bottom: 1px solid #aaa;">
           {#if TB_trajectory_complete}
             <Katex>
               {"\\mathcal{L}_{TB}(\\tau) = \\left(\\log\\frac{Z_{\\theta}\\prod_t P_F(s_{t+1}|s_t)}"}{"{R(x)\\prod_t P_B(s_t|s_{t+1})}\\right)^2"}
               {`= \\left(\\log\\frac{${TB_current.z} \\cdot ${TB_current.pf}}{${edges.filter(e => e.to === TB_path.at(-1))[0].flow} \\cdot ${TB_current.pb}}\\right)^2 = 0`}
             </Katex>
           {:else}
             <Katex>
               {"\\mathcal{L}_{TB}(\\tau) = \\left(\\log\\frac{Z_{\\theta}\\prod_t P_F(s_{t+1}|s_t)}"}{"{R(x)\\prod_t P_B(s_t|s_{t+1})}"} \right)^2
             </Katex>
           {/if}
         </td>
       </tr>
   </tbody>
 </table>

<style>
  .mathexpl {
    display: block;
    text-align: center;
    font-size: 0.8rem;
    color: grey;
    width: 600px;
    max-width: calc(100% - 32px);
    margin: 5px auto 1rem;
  }
</style>
