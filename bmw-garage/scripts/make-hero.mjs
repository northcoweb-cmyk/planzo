// Renders the hero poster from the real 3D viewer (transparent background) -> public/hero/x3-hero.webp
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const here = path.dirname(fileURLToPath(import.meta.url))
const viewer = 'file://' + path.resolve(here, '../public/viewer/bmw-x3-viewer.html') + '?embed=1&auto=0&dz=1.18'
mkdirSync(path.resolve(here, '../public/hero'), { recursive: true })
const out = path.resolve(here, '../public/hero/x3-hero.png')
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const pg = await (await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })).newPage()
await pg.goto(viewer)
await pg.waitForTimeout(3500)
await pg.screenshot({ path: out, omitBackground: true })
await b.close()
execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open(${JSON.stringify(out)}).convert('RGBA')
bbox = im.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox()
print('bbox', bbox)
im.save(${JSON.stringify(out.replace('.png', '.webp'))}, 'WEBP', quality=88, method=6)
`], { stdio: 'inherit' })
