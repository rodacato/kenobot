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

function getCurrentBranch(cwd) {
  try {
    return exec('git symbolic-ref --short HEAD', { cwd })
  } catch {
    return null // detached HEAD = stable (tag) mode
  }
}

function getCurrentCommit(cwd) {
  return exec('git rev-parse HEAD', { cwd })
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

  const branch = getCurrentBranch(engineDir)

  if (branch) {
    await updateDev(engineDir, branch, values.check)
  } else {
    await updateStable(engineDir, values.check)
  }
}

async function updateDev(engineDir, branch, checkOnly) {
  const currentCommit = getCurrentCommit(engineDir)
  const shortCommit = currentCommit.slice(0, 7)
  console.log(`Channel: dev (${branch})`)
  console.log(`Current: ${shortCommit}`)

  console.log('Checking for updates...')
  execSync(`git fetch origin ${branch}`, { cwd: engineDir, stdio: 'pipe' })

  const remoteCommit = exec(`git rev-parse origin/${branch}`, { cwd: engineDir })

  if (remoteCommit === currentCommit) {
    console.log('Already up to date.')
    return
  }

  const ahead = exec(`git rev-list --count origin/${branch}..HEAD`, { cwd: engineDir })
  const behind = exec(`git rev-list --count HEAD..origin/${branch}`, { cwd: engineDir })
  console.log(`Behind: ${behind} commit(s), ahead: ${ahead} commit(s)`)

  if (checkOnly) {
    return
  }

  console.log(`\nPulling latest ${branch}...`)

  try {
    execSync(`git pull origin ${branch}`, { cwd: engineDir, stdio: 'pipe' })
    execSync('npm install --omit=dev', { cwd: engineDir, stdio: 'pipe' })

    const newVersion = exec('node src/cli.js version', { cwd: engineDir })
    console.log(`Updated successfully: ${newVersion} (${getCurrentCommit(engineDir).slice(0, 7)})`)
  } catch (err) {
    console.error(`Update failed: ${err.message}`)
    console.log(`Rolling back to ${shortCommit}...`)
    try {
      execSync(`git reset --hard ${currentCommit}`, { cwd: engineDir, stdio: 'pipe' })
      execSync('npm install --omit=dev', { cwd: engineDir, stdio: 'pipe' })
      console.log('Rollback successful.')
    } catch {
      console.error('Rollback also failed. Manual intervention needed.')
    }
    process.exit(1)
  }
}

async function updateStable(engineDir, checkOnly) {
  const currentTag = getCurrentTag(engineDir)
  console.log(`Channel: stable`)
  console.log(`Current version: ${currentTag}`)

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

  if (checkOnly) {
    return
  }

  console.log(`\nUpdating ${currentTag} → ${latestTag}...`)

  try {
    execSync(`git checkout ${latestTag}`, { cwd: engineDir, stdio: 'pipe' })
    execSync('npm install --omit=dev', { cwd: engineDir, stdio: 'pipe' })

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
