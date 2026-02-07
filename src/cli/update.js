import { execSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

function exec(cmd, opts) {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim()
}

function getLatestTag(cwd) {
  const tags = exec('git tag -l "v*" --sort=-v:refname', { cwd })
  return tags.split('\n')[0] || ''
}

function getCurrentTag(cwd) {
  try {
    return exec('git describe --tags --abbrev=0', { cwd })
  } catch {
    return 'unknown'
  }
}

export default async function update(args, paths) {
  const { values } = parseArgs({
    args,
    options: { check: { type: 'boolean', default: false } },
    strict: false,
  })

  const engineDir = paths.engine

  if (!existsSync(join(engineDir, '.git'))) {
    console.log('Update is not available (not a git repository).')
    console.log('If installed via npm, use: npm update -g kenobot')
    process.exit(0)
  }

  const currentTag = getCurrentTag(engineDir)
  console.log(`Current version: ${currentTag}`)

  // Fetch latest tags
  console.log('Checking for updates...')
  execSync('git fetch --tags', { cwd: engineDir, stdio: 'pipe' })

  const latestTag = getLatestTag(engineDir)
  if (!latestTag) {
    console.log('No release tags found.')
    return
  }

  if (latestTag === currentTag) {
    console.log('Already up to date.')
    return
  }

  console.log(`Available: ${latestTag}`)

  if (values.check) {
    return
  }

  // Update
  console.log(`\nUpdating ${currentTag} → ${latestTag}...`)

  try {
    execSync(`git checkout ${latestTag}`, { cwd: engineDir, stdio: 'pipe' })
    execSync('npm install --omit=dev', { cwd: engineDir, stdio: 'pipe' })

    // Verify
    const newVersion = exec('node src/cli.js version', { cwd: engineDir })
    console.log(`Updated successfully: ${newVersion}`)
  } catch (err) {
    console.error(`Update failed: ${err.message}`)
    console.log(`Rolling back to ${currentTag}...`)
    try {
      execSync(`git checkout ${currentTag}`, { cwd: engineDir, stdio: 'pipe' })
      execSync('npm install --omit=dev', { cwd: engineDir, stdio: 'pipe' })
      console.log('Rollback successful.')
    } catch {
      console.error('Rollback also failed. Manual intervention needed.')
    }
    process.exit(1)
  }
}
