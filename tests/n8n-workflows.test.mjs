import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const directory = 'n8n/workflows';
for (const file of readdirSync(directory).filter(name => name.endsWith('.json'))) {
  test(`${file} is a well-formed, local-only workflow graph`, () => {
    const raw = readFileSync(`${directory}/${file}`,'utf8');
    const workflow = JSON.parse(raw);
    assert.equal(workflow.active,false);
    assert.ok(workflow.name.startsWith('MicroBizFlow '));
    assert.ok(Array.isArray(workflow.nodes) && workflow.nodes.length >= 3);
    assert.ok(workflow.nodes.some(node => node.type === 'n8n-nodes-base.webhook' || node.type === 'n8n-nodes-base.scheduleTrigger'));
    assert.ok(workflow.nodes.some(node => node.type === 'n8n-nodes-base.httpRequest'));
    const names = new Set(workflow.nodes.map(node => node.name));
    const ids = new Set(workflow.nodes.map(node => node.id));
    assert.equal(names.size,workflow.nodes.length);
    assert.equal(ids.size,workflow.nodes.length);
    for (const [source,outputs] of Object.entries(workflow.connections)) {
      assert.ok(names.has(source),`Unknown source: ${source}`);
      for (const branch of outputs.main ?? []) for (const edge of branch) assert.ok(names.has(edge.node),`Unknown target: ${edge.node}`);
    }
    assert.doesNotMatch(raw,/Bearer\s+[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{16,}|api[_-]?key["']?\s*:\s*["'][^"']{16,}/i);
    assert.doesNotMatch(raw,/https?:\/\/(?!127\.0\.0\.1|localhost)/i);
  });
}
