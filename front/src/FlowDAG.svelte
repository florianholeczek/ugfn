<script>
  // Fig. 8: example DAG with flow values. Hover edges for policy, nodes for flow and loss.
  // hoveredNode / hoveredEdge can be bound from outside to drive the highlight (presentation mode).
  import Katex from 'svelte-katex';
  import {nodes, edges, nodeById, previousStatesFormula, nextStatesFormula, previousStatesValues, nextStatesValues, policyFormula, policyValue, lossValue} from './DAG.js';

  export let hoveredNode = null;
  export let hoveredEdge = null;


$: nodeColors = {};
$: {
  for (const node of nodes) {
    if (!hoveredNode) {
      nodeColors[node.id] = 'gray';
    } else if (node.id === hoveredNode) {
      nodeColors[node.id] = '#d95f02';
    } else if (edges.some(e => e.to === hoveredNode&& e.from === node.id)) {
      nodeColors[node.id] = '#1b9e77';
    } else if (edges.some(e => e.from === hoveredNode&& e.to === node.id)) {
      nodeColors[node.id] = '#7570b3';
    } else {
      nodeColors[node.id] = 'gray';
    }
  }
}
$: edgeColors = {};
$: {
  for (const edge of edges) {
    const key = edge.from + '-' + edge.to;

    if (hoveredEdge) {
      if (edge.from === hoveredEdge.from && edge.to === hoveredEdge.to) {
        edgeColors[key] = '#d95f02'; // the edge being hovered
      } else if (edge.from === hoveredEdge.from) {
        edgeColors[key] = '#1b9e77'; // same source node
      } else {
        edgeColors[key] = 'gray';
      }
    } else if (hoveredNode) {
      if (edge.to === hoveredNode) {
        edgeColors[key] = '#1b9e77';
      } else if (edge.from === hoveredNode) {
        edgeColors[key] = '#7570b3';
      } else {
        edgeColors[key] = 'gray';
      }
    } else {
      edgeColors[key] = 'gray';
    }
  }
}
</script>

<svg class="dag-svg" width="800" height="350" viewBox="0 0 800 350" style="display: block; margin: 20px auto;">
  <!-- Marker for arrows -->
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5"
      markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="gray" />
    </marker>
  </defs>

  <!-- Edges (arrows and flow info) -->
  {#each edges as edge (edge.from + '-' + edge.to)}
    {#if nodeById(edge.from) && nodeById(edge.to)}


      <!-- Visible edge -->
      <line
        x1="{nodeById(edge.from).x}"
        y1="{nodeById(edge.from).y}"
        x2="{nodeById(edge.to).x}"
        y2="{nodeById(edge.to).y}"
        stroke="{edgeColors[edge.from + '-' + edge.to]}"
        stroke-width="2"
        marker-end="url(#arrow-{edgeColors[edge.from + '-' + edge.to]})"
      />

      <!-- Flow label-->
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
        <circle r="3" fill="black">
          <animateMotion
            dur="{3 - i * 0.3}s"
            repeatCount="indefinite"
          >
            <mpath href="#path-{edge.from}-{edge.to}" />
          </animateMotion>
        </circle>
      {/each}

      <!-- Invisible hover hitbox -->
      <line
        x1="{nodeById(edge.from).x}"
        y1="{nodeById(edge.from).y}"
        x2="{nodeById(edge.to).x}"
        y2="{nodeById(edge.to).y}"
        stroke="transparent"
        stroke-width="32"
        on:mouseenter={() => { hoveredEdge = edge; hoveredNode = null; }}
        on:mouseleave={() => hoveredEdge = null}
        role="presentation"
      />
    {/if}
  {/each}

  <!-- Nodes (with labels inside shapes) -->
  {#each nodes as node}
  <g
    role="presentation"
    on:mouseenter={() => { hoveredNode = node.id; hoveredEdge = null; }}
    on:mouseleave={() => hoveredNode= null}
  >
    {#if node.id === 's0'}
      <!-- Triangle for start state -->
      <polygon
        points="{node.x - 10},{node.y + 20} {node.x - 10},{node.y - 20} {node.x + 30},{node.y}"
        fill="{nodeColors[node.id]}"
        stroke="black"
        stroke-width="1"
      />
    {:else if node.final}
      <!-- Square for final state -->
      <rect
        x="{node.x - 20}"
        y="{node.y - 20}"
        width="40"
        height="40"
        rx="4"
        ry="4"
        fill="{nodeColors[node.id]}"
        stroke="black"
        stroke-width="1"
      />
    {:else}
      <!-- Circle for normal state -->
      <circle
        cx="{node.x}"
        cy="{node.y}"
        r="20"
        fill="{nodeColors[node.id]}"
        stroke="black"
        stroke-width="1"
      />
    {/if}

    <!-- Node label -->
    <text
      x="{node.x}"
      y="{node.y + 5}"
      text-anchor="middle"
      font-size="14"
      fill="white"
    >
      {node.id}
    </text>
    {#if node.final}
      <!-- Reward of the final state -->
      <text x="{node.x}" y="{node.y + 36}" text-anchor="middle" font-size="12" fill="black">R = {node.reward}</text>
    {/if}
  </g>
{/each}

</svg>
<p class="mathexpl" style="width:750px">
  Fig. 8: A DAG with flow values at the edges representing a fully trained GFlowNet. Hover over the edges (actions) to see the policy calculations. Hover over the nodes (states) to see the flow and loss calculations.
</p>


<table class="formula-table" style="width: 900px; border-collapse: collapse; margin: 20px auto; font-family: 'Georgia', serif; font-size: 16px;">
  <tbody>
      <tr>
        <td style="width: 120px; height: 110px; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #aaa; border-top: 2px solid black;">Flow</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #aaa; border-top: 2px solid black;">
          {#if hoveredEdge}
            <Katex>
              {`F(\\textcolor{#d95f02}{s_${hoveredEdge.from[1]} \\to ${hoveredEdge.to[0]}_${hoveredEdge.to[1]}}) = ${hoveredEdge.flow}`}
            </Katex>
          {:else if hoveredNode}
            <Katex>
              {`F_{in}(\\textcolor{#d95f02}{${hoveredNode[0]}_${hoveredNode[1]}}) = \\textcolor{#1b9e77}{${previousStatesFormula(hoveredNode)}} = ${previousStatesValues(hoveredNode)}`}
            </Katex>
            <br>
            <br>
            {#if nodeById(hoveredNode).final}
              <Katex>
                {`F_{out}(\\textcolor{#d95f02}{x_${hoveredNode[1]}}) = \\textcolor{#7570b3}{R(x_${hoveredNode[1]}) + 0} = ${nextStatesValues(hoveredNode)}`}
              </Katex>
            {:else}
              <Katex>
                {`F_{out}(\\textcolor{#d95f02}{s_${hoveredNode[1]}}) = \\textcolor{#7570b3}{0 + ${nextStatesFormula(hoveredNode)}} = ${nextStatesValues(hoveredNode)}`}
              </Katex>
            {/if}
          {:else}
            <Katex>
              {`F_{in}(s) = \\sum_{s' \\in parents(s)} F(s' \\to s)`}
            </Katex>
            <br>
            <br>
            <Katex>
              {`F_{out}(s) = R(s) + \\sum_{s' \\in children(s)} F(s \\to s')`}
            </Katex>
          {/if}
        </td>
      </tr>
      <tr>
        <td style="width: 120px; height: 100px; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #aaa;">Policy</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #aaa;">
          {#if hoveredEdge}
            <Katex>
              {`P_F(\\textcolor{#d95f02}{${hoveredEdge.to[0]}_${hoveredEdge.to[1]}|s_${hoveredEdge.from[1]}}) = \\frac{\\textcolor{#d95f02}{F(s_${hoveredEdge.from[1]} \\to ${hoveredEdge.to[0]}_${hoveredEdge.to[1]})}}{\\textcolor{#d95f02}{F(s_${hoveredEdge.from[1]} \\to ${hoveredEdge.to[0]}_${hoveredEdge.to[1]})} \\textcolor{#1b9e77}{${policyFormula(hoveredEdge)}}} = ${policyValue(hoveredEdge)}`}
            </Katex>
          {:else if hoveredNode}
            The policy is calculated for each action.
          {:else}
            <Katex>
              {`P_F(s'|s) = \\frac{F(s \\to s')}{\\sum_{s'' \\in children(s)} F(s \\to s'')}`}
            </Katex>
          {/if}
        </td>
      </tr>
      <tr>
        <td style="width: 120px; height: 100px; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #aaa;">Loss</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #aaa;">
          {#if hoveredEdge}
            The loss is calculated for each state.
          {:else if hoveredNode}
            <Katex>
              {`\\mathcal{L}_{FM}(\\textcolor{#d95f02}{${hoveredNode[0]}_${hoveredNode[1]}}) = \\left( \\log \\frac{\\textcolor{#1b9e77}{${previousStatesFormula(hoveredNode)}}}{\\textcolor{#7570b3}{${nextStatesFormula(hoveredNode)}}} \\right)^2 = ${lossValue(hoveredNode)}`}
            </Katex>
          {:else}
            <Katex>
              {`\\mathcal{L}_{FM}(s) = \\left( \\log \\frac{ \\sum_{s' \\in parents(s)} F(s' \\to s)}{R(s) + \\sum_{s' \\in children(s)} F(s \\to s')} \\right)^2`}
            </Katex>
          {/if}
        </td>
      </tr>
  </tbody>
</table>

<style>
  /* same as .mathexpl in App.svelte (scoped there, so repeated here) */
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
