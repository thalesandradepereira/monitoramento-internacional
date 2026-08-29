import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const deployPath = path.resolve('deploy.sh')
const deploy = fs.readFileSync(deployPath, 'utf8')

test('grants roles/run.builder to the Compute Engine default build service account before source deploy', () => {
  const projectNumberLookup = deploy.indexOf("gcloud projects describe \"$PROJECT_ID\" --format='value(projectNumber)'")
  const builderRole = deploy.indexOf('--role roles/run.builder')
  const computeSa = deploy.indexOf('-compute@developer.gserviceaccount.com')
  const deployCommand = deploy.indexOf('gcloud run deploy "$SERVICE_NAME"')

  assert.notEqual(projectNumberLookup, -1, 'project number must be resolved dynamically')
  assert.notEqual(builderRole, -1, 'roles/run.builder binding must be present')
  assert.notEqual(computeSa, -1, 'default Compute Engine build service account must be targeted')
  assert.ok(builderRole < deployCommand, 'builder IAM binding must happen before gcloud run deploy --source')
})
