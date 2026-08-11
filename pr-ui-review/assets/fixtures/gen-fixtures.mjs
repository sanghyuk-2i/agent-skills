#!/usr/bin/env node
// annotate.mjs 검증용 고정 이미지 생성기.
// 딱 한 군데(결제 버튼)만 다른 before/after 한 쌍을 만든다 → 박스가 정확히 1개 나와야 한다.
//   node gen-fixtures.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../../scripts/lib/browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const page = (variant) => `<!doctype html><meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f7f9;color:#111}
  header{background:#fff;border-bottom:1px solid #e5e7eb;padding:16px 32px;display:flex;gap:24px;align-items:center}
  .logo{font-weight:700;font-size:18px}
  nav a{color:#6b7280;text-decoration:none;margin-right:20px}
  main{max-width:640px;margin:40px auto;padding:0 24px}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:16px}
  h1{font-size:24px;margin-bottom:8px}
  p{color:#6b7280;margin-bottom:20px}
  .row{display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid #f3f4f6}
  .total{font-weight:700}
  .pay{
    ${variant === 'after'
      ? 'height:48px;border-radius:12px;background:#111827;font-size:16px;'
      : 'height:40px;border-radius:4px;background:#2563eb;font-size:14px;'}
    width:100%;color:#fff;border:0;font-weight:600;cursor:pointer;margin-top:20px
  }
  footer{text-align:center;color:#9ca3af;padding:32px;font-size:13px}
</style>
<header>
  <div class="logo">ACME</div>
  <nav><a href="#">상품</a><a href="#">장바구니</a><a href="#">주문내역</a></nav>
</header>
<main>
  <div class="card">
    <h1>결제</h1>
    <p>주문 내용을 확인하고 결제를 진행하세요.</p>
    <div class="row"><span>무선 키보드</span><span>89,000원</span></div>
    <div class="row"><span>USB-C 허브</span><span>42,000원</span></div>
    <div class="row"><span>배송비</span><span>3,000원</span></div>
    <div class="row total"><span>합계</span><span>134,000원</span></div>
    <button class="pay">${variant === 'after' ? '안전하게 결제하기' : '결제하기'}</button>
  </div>
  <div class="card">
    <h1>배송지</h1>
    <p>서울시 강남구 테헤란로 123, 4층</p>
  </div>
</main>
<footer>© 2026 ACME</footer>`;

const { browser } = await launchChromium(here);
for (const variant of ['before', 'after']) {
  const p = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
  await p.setContent(page(variant), { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(here, `${variant}.png`), fullPage: true });
  await p.close();
}
await browser.close();
console.log('fixtures 생성 완료:', here);
