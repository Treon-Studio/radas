(function() {
  fetch('/api/graph')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      document.getElementById('info').textContent =
        data.nodes.length + ' projects, ' + data.edges.length + ' edges';
      var elements = [];
      data.nodes.forEach(function(n) {
        elements.push({ group: 'nodes', data: { id: n.id, label: n.id, type: n.type } });
      });
      data.edges.forEach(function(e) {
        elements.push({ group: 'edges', data: { id: e.from + '->' + e.to, source: e.from, target: e.to } });
      });
      cytoscape({
        container: document.getElementById('cy'),
        elements: elements,
        style: [
          { selector: 'node', style: {
              label: 'data(label)',
              'background-color': function(ele) {
                switch (ele.data('type')) {
                  case 'backend-api': return '#a3c4f3';
                  case 'frontend-web': return '#b8e6b8';
                  case 'lib': return '#f3e5ab';
                  case 'design-tokens': return '#e6b8e6';
                  case 'infra-cloudflare': return '#f3b8a3';
                  default: return '#dddddd';
                }
              },
              'text-valign': 'center', 'text-halign': 'center',
              shape: 'round-rectangle'
          }},
          { selector: 'edge', style: {
              width: 2, 'line-color': '#999',
              'target-arrow-color': '#999', 'target-arrow-shape': 'triangle',
              'curve-style': 'bezier'
          }}
        ],
        layout: { name: 'dagre', rankDir: 'LR', nodeSep: 30, rankSep: 80 }
      });
    })
    .catch(function(err) {
      document.getElementById('info').textContent = 'Error: ' + err.message;
    });
})();
