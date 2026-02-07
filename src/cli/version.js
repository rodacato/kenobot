import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function version(args, paths) {
  const pkg = JSON.parse(await readFile(join(paths.engine, 'package.json'), 'utf8'))
  console.log(`kenobot v${pkg.version}`)
}
