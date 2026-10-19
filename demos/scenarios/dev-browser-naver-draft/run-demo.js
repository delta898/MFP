#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
let activeTempDir = '';

const ROOT = path.resolve(__dirname, '../../..');
const OUTPUT_DIR = __dirname;
const OUTPUT_VIDEO = path.join(OUTPUT_DIR, 'dev-browser-naver-draft.mp4');
const SAMPLE_IMAGE = path.join(ROOT, 'assets/icons/icon.png');
const ARTICLE = `# 원고를 블록으로 다듬고 이미지로 완성하기

좋은 글은 한 번에 완성되기보다, 읽고 고치는 과정을 거치며 또렷해집니다. 준비한 원고를 붙여넣고 문단과 이미지를 블록 단위로 정리하면 글의 흐름을 한눈에 살펴볼 수 있습니다.

[[IMAGE_0
title: 글쓰기 도구를 상징하는 이미지
prompt: 간결한 디지털 글쓰기와 창작을 상징하는 우아한 펜촉과 빛나는 아이디어, 깔끔한 중앙 구도
]]

## 내 문장으로 먼저 시작하기

처음부터 완벽한 문장을 쓰려고 애쓰기보다, 전하고 싶은 생각을 편하게 적어보세요. 초안을 편집기에 붙여넣은 뒤 문장을 다듬고, 필요한 곳에 소제목과 이미지를 더하면 글의 구조가 자연스럽게 잡힙니다.

## 장면을 이미지로 더하기

글로 설명하기 어려운 분위기는 이미지 한 장이 대신 전해줄 수 있습니다. 원고의 맥락을 살펴 어울리는 장면을 만들고, 마음에 들지 않으면 프롬프트를 바꾸어 다시 시도할 수 있습니다.

[[IMAGE_1
title: 차분한 글쓰기 공간
prompt: 따뜻한 초봄 아침, 햇살이 들어오는 정돈된 글쓰기 책상, 펼쳐진 노트와 펜, 창밖의 연둣빛 나무, 편안하고 차분한 라이프스타일 사진, 자연스러운 색감, 사실적인 사진, 이미지 안에 글자나 로고 없음
]]

원고와 이미지가 준비되면 네이버 블로그에 임시 저장해 두고, 마지막으로 한 번 더 확인할 수 있습니다.`;

const EDITED_ARTICLE = ARTICLE.replace(
  '좋은 글은 한 번에 완성되기보다, 읽고 고치는 과정을 거치며 또렷해집니다.',
  '좋은 글은 한 번에 완성되기보다, 읽고 고치는 과정을 거치며 더욱 또렷해집니다.'
);

function fail(message) {
  throw new Error(message);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!fs.existsSync(SAMPLE_IMAGE)) fail('시연용 이미지 파일을 찾을 수 없습니다.');

  const { prepareDevelopmentEnvironment } = require(path.join(ROOT, 'scripts/app-environment-launcher'));
  const developmentEnv = prepareDevelopmentEnvironment({ repoRoot: ROOT });
  Object.assign(process.env, developmentEnv);
  const CONFIG = require(path.join(ROOT, 'src/host/configuration/runtime-config'));
  if (CONFIG.RUNTIME_ENVIRONMENT_PROFILE?.environment !== 'development'
      || CONFIG.RUNTIME_ENVIRONMENT_PROFILE?.status !== 'ready') {
    fail('Development 환경이 준비되지 않아 시연을 시작하지 않습니다.');
  }
  if (!CONFIG.AUTH_FILE_PATH || !fs.existsSync(CONFIG.AUTH_FILE_PATH)) {
    fail('저장된 네이버 인증 세션을 찾을 수 없습니다.');
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-dev-demo-'));
  activeTempDir = tempDir;
  const uiVideo = path.join(tempDir, 'ui.webm');
  const naverVideoDir = path.join(tempDir, 'naver');
  fs.mkdirSync(naverVideoDir, { recursive: true });

  const { applyRuntimeNetworkPolicy } = require(path.join(ROOT, 'src/host/network/runtime-network-policy'));
  applyRuntimeNetworkPolicy();

  const BrowserLauncher = require(path.join(ROOT, 'src/browser-launcher'));
  const originalLaunchBrowser = BrowserLauncher.launchBrowser;
  BrowserLauncher.launchBrowser = async (options = {}) => {
    const launchedBrowser = await originalLaunchBrowser(options);
    if (options.headless === false) {
      const originalNewContext = launchedBrowser.newContext.bind(launchedBrowser);
      launchedBrowser.newContext = (contextOptions = {}) => originalNewContext({
        ...contextOptions,
        recordVideo: { dir: naverVideoDir, size: { width: 1440, height: 900 } }
      });
    }
    return launchedBrowser;
  };

  const { startUiServer } = require(path.join(ROOT, 'src/ui-server'));
  let uiServer;
  let browser;
  let videoSaved = false;
  try {
    uiServer = await startUiServer({ host: '127.0.0.1', port: 0, allowEphemeralPort: true, safeMode: true });
    const baseUrl = `http://127.0.0.1:${uiServer.port}`;
    const { chromium } = require(path.join(ROOT, 'node_modules/playwright'));
    browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--start-maximized'] });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      recordVideo: { dir: tempDir, size: { width: 1440, height: 900 } }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', (error) => console.error('[browser page error]', error.message));

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('.nav-btn[data-view="blog-next"]').click();
    await page.locator('#view-blog-next.active').waitFor();
    await page.locator('#blog-next-mode-tab-paste').click();
    await page.locator('#blog-next-mode-panel-paste:not([hidden])').waitFor();

    await page.locator('[data-paste-workspace-mode="markdown"]').click();
    const markdown = page.locator('#blog-next-paste-markdown');
    await markdown.fill(ARTICLE);
    await wait(500);
    await markdown.fill(EDITED_ARTICLE);
    await page.locator('[data-paste-workspace-mode="block"]').click();
    const imageBlocks = page.locator('#blog-next-paste-editor .manuscript-image-block');
    await imageBlocks.nth(1).waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('[data-paste-workspace-mode="view"]').click();
    await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-title]')
      .waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('[data-paste-workspace-mode="block"]').click();
    await imageBlocks.nth(1).waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForFunction(() => Array.from(document.querySelectorAll(
      '#blog-next-paste-editor .manuscript-image-block [data-manuscript-image-action="generate"]'
    )).filter((button) => button.dataset.slotId).length === 2, null, { timeout: 30000 });

    const firstImageInput = imageBlocks.nth(0).locator('input[type="file"]');
    await firstImageInput.setInputFiles(SAMPLE_IMAGE);
    await imageBlocks.nth(0).locator('img').waitFor({ state: 'visible', timeout: 30000 });

    await imageBlocks.nth(1).locator('[data-manuscript-image-action="generate"]').click();
    console.log('실제 AI 이미지 생성 대기 중…');
    await imageBlocks.nth(1).locator('img').waitFor({ state: 'visible', timeout: 360000 });

    const settings = page.locator('#blog-next-publish-settings');
    if (!(await settings.evaluate((element) => element.open))) await settings.locator('summary').click();
    await page.locator('#blog-next-target-naver').check();
    await page.locator('#blog-next-target-wordpress').uncheck();
    await page.locator('#blog-next-post-status').selectOption('draft');
    await page.locator('#blog-next-runner-headless').uncheck();
    const tempSaveButton = page.locator('[data-blog-next-draft-publish="paste"]');
    await tempSaveButton.waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-blog-next-draft-publish="paste"]');
      return Boolean(button && !button.disabled && button.textContent.includes('임시 저장'));
    });

    await tempSaveButton.click();
    await page.locator('#ui-dialog-backdrop:not(.hidden)').waitFor({ timeout: 10000 });
    const confirmation = (await page.locator('#ui-dialog-message').innerText()).trim();
    if (!confirmation.includes('네이버') || !confirmation.includes('임시 저장')) {
      fail(`공개 발행 방지를 위해 확인 내용을 검증하지 못했습니다: ${confirmation}`);
    }
    await page.locator('#ui-dialog-confirm').click();
    console.log('네이버 임시저장 중…');
    await page.waitForFunction(() => {
      const status = document.querySelector('#blog-next-publish-status');
      return Boolean(status && /임시 저장했습니다|임시 저장 완료/.test(status.innerText));
    }, null, { timeout: 300000 });
    await wait(2500);

    const video = page.video();
    await context.close();
    const uiPath = await video.path();
    fs.copyFileSync(uiPath, uiVideo);
    videoSaved = true;
    await browser.close();
    browser = null;
    console.log('임시 저장 완료. 녹화 파일을 정리합니다.');
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (uiServer?.server) await new Promise((resolve) => uiServer.server.close(resolve));
    BrowserLauncher.launchBrowser = originalLaunchBrowser;
  }

  const naverVideos = fs.readdirSync(naverVideoDir)
    .filter((name) => name.endsWith('.webm'))
    .map((name) => path.join(naverVideoDir, name));
  if (!videoSaved || !fs.existsSync(uiVideo) || naverVideos.length === 0) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fail('UI 또는 네이버 브라우저 녹화가 없어 최종 영상을 만들지 못했습니다.');
  }

  const inputs = [uiVideo, ...naverVideos];
  const filterParts = [];
  for (let index = 0; index < inputs.length; index += 1) {
    filterParts.push(
      `[${index}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v${index}]`
    );
  }
  filterParts.push(`${inputs.map((_input, index) => `[v${index}]`).join('')}concat=n=${inputs.length}:v=1:a=0[outv]`);
  const ffmpegArgs = [
    '-y',
    ...inputs.flatMap((input) => ['-i', input]),
    '-filter_complex', filterParts.join(';'),
    '-map', '[outv]',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '21',
    '-pix_fmt', 'yuv420p',
    OUTPUT_VIDEO
  ];
  const ffmpeg = spawnSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
  fs.rmSync(tempDir, { recursive: true, force: true });
  activeTempDir = '';
  if (ffmpeg.error || ffmpeg.status !== 0) {
    fail(`FFmpeg 영상 합치기 실패: ${ffmpeg.error?.message || ffmpeg.status}`);
  }
  console.log(`완료: ${OUTPUT_VIDEO}`);
}

main().catch((error) => {
  if (activeTempDir && fs.existsSync(activeTempDir)) {
    fs.rmSync(activeTempDir, { recursive: true, force: true });
  }
  console.error(`시연 실패: ${error.message}`);
  process.exitCode = 1;
});
