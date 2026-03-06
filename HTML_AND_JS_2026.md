# HTML + 原生 JavaScript 完整指南 (2026)

> 涵蓋 ES2023 ~ ES2025+ 的主要語法，每節附最小可動網頁範例。

---

## 目錄

1. [HTML5 基本結構](#1-html5-基本結構)
2. [變數宣告 let / const](#2-變數宣告-let--const)
3. [模板字串 Template Literals](#3-模板字串-template-literals)
4. [箭頭函式 Arrow Functions](#4-箭頭函式-arrow-functions)
5. [解構賦值 Destructuring](#5-解構賦值-destructuring)
6. [展開與其餘運算子 Spread / Rest](#6-展開與其餘運算子-spread--rest)
7. [類別 Classes（含私有欄位 #）](#7-類別-classes含私有欄位-)
8. [Promise 與 async/await](#8-promise-與-asyncawait)
9. [Fetch API](#9-fetch-api)
10. [可選鏈結 Optional Chaining (?.)](#10-可選鏈結-optional-chaining-)
11. [空值合併 Nullish Coalescing (??)](#11-空值合併-nullish-coalescing-)
12. [陣列方法 Array Methods](#12-陣列方法-array-methods)
13. [Object.groupBy / Map.groupBy（ES2024）](#13-objectgroupby--mapgroupbyes2024)
14. [Promise.withResolvers（ES2024）](#14-promisewithresolverses2024)
15. [Iterator Helpers（ES2025）](#15-iterator-helperses2025)
16. [Set 集合運算（ES2025）](#16-set-集合運算es2025)
17. [模組 ES Modules（import / export）](#17-模組-es-modulesimport--export)
18. [Proxy 與 Reflect](#18-proxy-與-reflect)
19. [structuredClone 深拷貝](#19-structuredclone-深拷貝)
20. [DOM 操作與事件](#20-dom-操作與事件)
21. [Web Storage（localStorage / sessionStorage）](#21-web-storagelocalStorage--sessionstorage)
22. [Intersection Observer API](#22-intersection-observer-api)
23. [Temporal API（ES2025）](#23-temporal-apies2025)

---

## 1. HTML5 基本結構

現代網頁最小骨架，包含 `meta`、`charset`、`viewport` 等必備標籤。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hello 2026</title>
</head>
<body>
  <h1>Hello, World!</h1>
  <p>這是一個最小的 HTML5 網頁。</p>

  <script>
    console.log('JS 執行中');
  </script>
</body>
</html>
```

---

## 2. 變數宣告 let / const

- `const`：值不可重新賦值（物件內部屬性仍可改）
- `let`：區塊作用域，可重新賦值
- 不再使用 `var`

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8" /><title>let & const</title></head>
<body>
<script>
  const name = 'Alice';
  let score = 90;

  score += 10; // OK
  // name = 'Bob'; // TypeError!

  const user = { age: 25 };
  user.age = 26; // const 物件內部可改

  document.write(`${name} 的分數：${score}，年齡：${user.age}`);
</script>
</body>
</html>
```

---

## 3. 模板字串 Template Literals

使用反引號 `` ` `` 包裹，支援多行與嵌入表達式 `${}`。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8" /><title>Template Literals</title></head>
<body>
<script>
  const item = 'JavaScript';
  const year = 2026;

  const msg = `
    歡迎學習 ${item}！
    現在是 ${year} 年，
    2 + 3 = ${2 + 3}
  `;

  const pre = document.createElement('pre');
  pre.textContent = msg;
  document.body.appendChild(pre);
</script>
</body>
</html>
```

---

## 4. 箭頭函式 Arrow Functions

簡潔語法，且不綁定自己的 `this`。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8" /><title>Arrow Functions</title></head>
<body>
<script>
  // 一般寫法
  const add = (a, b) => a + b;

  // 多行寫法
  const greet = (name) => {
    const msg = `Hi, ${name}!`;
    return msg;
  };

  // 隱式回傳物件（用括號包）
  const makeUser = (id, name) => ({ id, name });

  document.write(add(3, 4) + '<br>');
  document.write(greet('Alice') + '<br>');
  document.write(JSON.stringify(makeUser(1, 'Bob')));
</script>
</body>
</html>
```

---

## 5. 解構賦值 Destructuring

從陣列或物件中快速取值。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8" /><title>Destructuring</title></head>
<body>
<script>
  // 陣列解構
  const [first, second, ...rest] = [10, 20, 30, 40];

  // 物件解構（含預設值與重新命名）
  const { name = 'Unknown', age: userAge, city = 'Taipei' } =
    { name: 'Alice', age: 25 };

  // 函式參數解構
  const show = ({ title, price }) =>
    `${title}：$${price}`;

  document.write(`first=${first}, second=${second}, rest=${rest}<br>`);
  document.write(`${name}, ${userAge}, ${city}<br>`);
  document.write(show({ title: '課程', price: 299 }));
</script>
</body>
</html>
```

---

## 6. 展開與其餘運算子 Spread / Rest

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8" /><title>Spread & Rest</title></head>
<body>
<script>
  // Spread：展開陣列
  const a = [1, 2, 3];
  const b = [...a, 4, 5];          // [1,2,3,4,5]

  // Spread：合併物件（後者覆蓋前者）
  const base = { color: 'red', size: 'M' };
  const updated = { ...base, size: 'L', weight: 300 };

  // Rest：收集剩餘參數
  const sum = (...nums) => nums.reduce((acc, n) => acc + n, 0);

  document.write(JSON.stringify(b) + '<br>');
  document.write(JSON.stringify(updated) + '<br>');
  document.write('sum(1,2,3,4,5) = ' + sum(1, 2, 3, 4, 5));
</script>
</body>
</html>
```

---

## 7. 類別 Classes（含私有欄位 #）

ES2022+ 支援真正的私有欄位與靜態私有方法。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8" /><title>Classes</title></head>
<body>
<script>
  class BankAccount {
    #balance = 0;           // 私有欄位
    static #count = 0;      // 靜態私有欄位

    constructor(owner, initial) {
      this.owner = owner;
      this.#balance = initial;
      BankAccount.#count++;
    }

    deposit(amount) {
      if (amount <= 0) throw new Error('金額需大於 0');
      this.#balance += amount;
    }

    get balance() { return this.#balance; }

    static get totalAccounts() { return BankAccount.#count; }
  }

  class SavingAccount extends BankAccount {
    #interestRate;
    constructor(owner, initial, rate) {
      super(owner, initial);
      this.#interestRate = rate;
    }
    applyInterest() {
      this.deposit(this.balance * this.#interestRate);
    }
  }

  const acc = new SavingAccount('Alice', 1000, 0.05);
  acc.applyInterest();
  document.write(`${acc.owner} 餘額：${acc.balance}<br>`);
  document.write(`帳戶總數：${BankAccount.totalAccounts}`);
</script>
</body>
</html>
```

---

## 8. Promise 與 async/await

處理非同步操作的現代方式。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8" /><title>async/await</title></head>
<body>
<div id="out"></div>
<script>
  const log = (msg) => {
    document.getElementById('out').innerHTML += msg + '<br>';
  };

  // 模擬非同步任務
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const fetchUser = async (id) => {
    await delay(300);
    if (id < 0) throw new Error('無效 ID');
    return { id, name: `User_${id}` };
  };

  // 循序執行
  async function main() {
    log('開始...');

    // try/catch 錯誤處理
    try {
      const user = await fetchUser(42);
      log(`取得用戶：${JSON.stringify(user)}`);
    } catch (err) {
      log(`錯誤：${err.message}`);
    }

    // 平行執行
    const [u1, u2] = await Promise.all([fetchUser(1), fetchUser(2)]);
    log(`平行結果：${u1.name}, ${u2.name}`);

    // Promise.allSettled：不因單一失敗中止
    const results = await Promise.allSettled([fetchUser(3), fetchUser(-1)]);
    results.forEach(r => log(
      r.status === 'fulfilled' ? r.value.name : `失敗：${r.reason.message}`
    ));
  }

  main();
</script>
</body>
</html>
```

---

## 9. Fetch API

瀏覽器原生的 HTTP 請求工具。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8" /><title>Fetch API</title></head>
<body>
<button id="btn">載入用戶</button>
<ul id="list"></ul>
<script>
  document.getElementById('btn').addEventListener('click', async () => {
    const list = document.getElementById('list');
    list.innerHTML = '載入中...';

    try {
      const res = await fetch('https://jsonplaceholder.typicode.com/users?_limit=3');

      if (!res.ok) throw new Error(`HTTP 錯誤：${res.status}`);

      const users = await res.json();
      list.innerHTML = users
        .map(u => `<li><b>${u.name}</b> — ${u.email}</li>`)
        .join('');
    } catch (err) {
      list.innerHTML = `<li style="color:red">錯誤：${err.message}</li>`;
    }
  });
</script>
</body>
</html>
```

---

## 10. 可選鏈結 Optional Chaining (?.)

安全存取深層屬性，避免 `Cannot read property` 錯誤。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8" /><title>Optional Chaining</title></head>
<body>
<script>
  const user = {
    name: 'Alice',
    address: {
      city: 'Taipei'
    },
    greet() { return `Hi, I'm ${this.name}`; }
  };

  // 一般存取（可能 undefined）
  const city    = user?.address?.city;          // 'Taipei'
  const zip     = user?.address?.zipCode;       // undefined（不報錯）
  const country = user?.contact?.phone;         // undefined（不報錯）

  // 方法呼叫
  const msg     = user?.greet?.();              // "Hi, I'm Alice"
  const noFunc  = user?.fly?.();               // undefined（不報錯）

  // 搭配陣列索引
  const arr = [10, 20, 30];
  const val = arr?.[5];                         // undefined

  document.write(`city: ${city}<br>`);
  document.write(`zip: ${zip}<br>`);
  document.write(`msg: ${msg}<br>`);
  document.write(`arr[5]: ${val}`);
</script>
</body>
</html>
```

---

## 11. 空值合併 Nullish Coalescing (??)

只有 `null` 或 `undefined` 時才使用預設值（不同於 `||` 會對 `0`、`''` 也觸發）。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8" /><title>Nullish Coalescing</title></head>
<body>
<script>
  const config = { timeout: 0, label: '', debug: null };

  // || 的問題：0 和 '' 被視為 falsy
  const t1 = config.timeout || 3000;   // 3000（錯誤！timeout 明確設為 0）
  const l1 = config.label   || 'N/A';  // 'N/A'（錯誤！label 明確設為 ''）

  // ?? 只管 null / undefined
  const t2 = config.timeout ?? 3000;   // 0 ✅
  const l2 = config.label   ?? 'N/A';  // '' ✅
  const d2 = config.debug   ?? false;  // false（null → 使用預設）

  // ??= 賦值運算子
  let cache = null;
  cache ??= '初始化';                   // cache 變成 '初始化'

  document.write(`t1=${t1}, t2=${t2}<br>`);
  document.write(`l1="${l1}", l2="${l2}"<br>`);
  document.write(`debug=${d2}<br>`);
  document.write(`cache=${cache}`);
</script>
</body>
</html>
```

---

## 12. 陣列方法 Array Methods

涵蓋 ES2023 新增的 `findLast`、`findLastIndex`、`toSorted`、`toReversed`、`toSpliced`、`with`。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8" /><title>Array Methods</title></head>
<body>
<script>
  const log = (label, val) =>
    document.write(`<b>${label}：</b>${JSON.stringify(val)}<br>`);

  const nums = [3, 1, 4, 1, 5, 9, 2, 6];

  // 經典方法
  log('map    x2', nums.map(n => n * 2));
  log('filter >3', nums.filter(n => n > 3));
  log('reduce sum', nums.reduce((a, n) => a + n, 0));

  // at()：支援負數索引
  log('at(-1)', nums.at(-1));

  // findLast / findLastIndex（ES2023）
  log('findLast >3', nums.findLast(n => n > 3));
  log('findLastIndex >3', nums.findLastIndex(n => n > 3));

  // 非破壞性排序/反轉/修改（ES2023）
  log('toSorted', nums.toSorted((a, b) => a - b));  // 原陣列不變
  log('toReversed', nums.toReversed());
  log('with(2, 99)', nums.with(2, 99));               // 替換索引 2

  // flat / flatMap
  const nested = [[1, 2], [3, [4, 5]]];
  log('flat(1)', nested.flat(1));
  log('flat(Infinity)', nested.flat(Infinity));

  const sentences = ['hello world', 'foo bar'];
  log('flatMap split', sentences.flatMap(s => s.split(' ')));

  // Array.from
  log('Array.from range', Array.from({ length: 5 }, (_, i) => i * 2));
</script>
</body>
</html>
```

---

## 13. Object.groupBy / Map.groupBy（ES2024）

依條件分組，回傳以群組鍵為屬性的物件或 Map。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8" /><title>groupBy ES2024</title></head>
<body>
<script>
  const products = [
    { name: '蘋果', type: '水果', price: 30 },
    { name: '香蕉', type: '水果', price: 15 },
    { name: '紅蘿蔔', type: '蔬菜', price: 20 },
    { name: '菠菜', type: '蔬菜', price: 25 },
    { name: '牛奶', type: '飲品', price: 60 },
  ];

  // Object.groupBy
  const byType = Object.groupBy(products, p => p.type);
  document.write('<pre>' + JSON.stringify(byType, null, 2) + '</pre>');

  // Map.groupBy（key 可以是任意型別）
  const byPriceRange = Map.groupBy(products,
    p => p.price >= 30 ? '高價' : '低價'
  );
  byPriceRange.forEach((items, key) => {
    document.write(`<b>${key}：</b>${items.map(i => i.name).join(', ')}<br>`);
  });
</script>
</body>
</html>
```

---

## 14. Promise.withResolvers（ES2024）

更方便地在外部控制 Promise 的 resolve / reject。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8" /><title>Promise.withResolvers</title></head>
<body>
<button id="ok">成功</button>
<button id="fail">失敗</button>
<p id="result">等待操作...</p>
<script>
  const result = document.getElementById('result');

  // 建立可外部控制的 Promise
  const { promise, resolve, reject } = Promise.withResolvers();

  document.getElementById('ok').addEventListener('click', () => {
    resolve('使用者按下成功！');
  });

  document.getElementById('fail').addEventListener('click', () => {
    reject(new Error('使用者取消操作'));
  });

  promise
    .then(val => result.textContent = `✅ ${val}`)
    .catch(err => result.textContent = `❌ ${err.message}`);
</script>
</body>
</html>
```

---

## 15. Iterator Helpers（ES2025）

對任意可迭代物件使用 `map`、`filter`、`take`、`drop`、`flatMap`、`reduce` 等方法，支援惰性求值。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8" /><title>Iterator Helpers ES2025</title></head>
<body>
<script>
  // 無限產生器
  function* naturals(start = 1) {
    let n = start;
    while (true) yield n++;
  }

  // Iterator Helpers 允許鏈式、惰性操作
  const result = naturals()
    .filter(n => n % 2 === 0)   // 篩出偶數
    .map(n => n * n)             // 平方
    .take(5)                     // 只取前 5 個
    .toArray();                  // 收集為陣列

  document.write('前5個偶數的平方：' + JSON.stringify(result) + '<br>');

  // 另一個例子：字串迭代
  const chars = 'Hello, 2026!'[Symbol.iterator]();
  const upper = chars
    .filter(c => /[a-zA-Z]/.test(c))
    .map(c => c.toUpperCase())
    .toArray()
    .join('');

  document.write('字母大寫：' + upper);
</script>
</body>
</html>
```

---

## 16. Set 集合運算（ES2025）

`Set` 新增原生的聯集、交集、差集、對稱差集等方法。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8" /><title>Set Methods ES2025</title></head>
<body>
<script>
  const log = (label, s) =>
    document.write(`<b>${label}：</b>[${[...s].join(', ')}]<br>`);

  const a = new Set([1, 2, 3, 4, 5]);
  const b = new Set([3, 4, 5, 6, 7]);

  log('union（聯集）',           a.union(b));           // {1,2,3,4,5,6,7}
  log('intersection（交集）',    a.intersection(b));    // {3,4,5}
  log('difference（差集 a-b）',  a.difference(b));      // {1,2}
  log('symmetricDifference（對稱差集）', a.symmetricDifference(b)); // {1,2,6,7}

  // 子集合判斷
  const c = new Set([3, 4]);
  document.write(`c.isSubsetOf(a)：${c.isSubsetOf(a)}<br>`);      // true
  document.write(`a.isSupersetOf(c)：${a.isSupersetOf(c)}<br>`);  // true
  document.write(`a.isDisjointFrom(new Set([8,9]))：${a.isDisjointFrom(new Set([8, 9]))}`); // true
</script>
</body>
</html>
```

---

## 17. 模組 ES Modules（import / export）

瀏覽器原生模組系統，使用 `type="module"`。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8" /><title>ES Modules</title></head>
<body>
<div id="out"></div>
<script type="module">
  // 動態 import（非同步載入）
  // import { add } from './math.js';     // 靜態匯入（一般用法）

  // 內聯模擬：使用 Blob URL 示範模組化
  const mathCode = `
    export const add = (a, b) => a + b;
    export const multiply = (a, b) => a * b;
    export default function greet(name) {
      return \`Hello, \${name}!\`;
    }
  `;
  const blob = new Blob([mathCode], { type: 'application/javascript' });
  const url  = URL.createObjectURL(blob);

  const { add, multiply, default: greet } = await import(url);
  URL.revokeObjectURL(url);

  const out = document.getElementById('out');
  out.innerHTML = `
    add(3,4) = ${add(3, 4)}<br>
    multiply(3,4) = ${multiply(3, 4)}<br>
    ${greet('World')}
  `;
</script>
</body>
</html>
```

---

## 18. Proxy 與 Reflect

攔截並自訂物件的基本操作（讀取、寫入、刪除等）。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8" /><title>Proxy & Reflect</title></head>
<body>
<script>
  // 建立帶驗證的響應式物件
  function createReactive(target) {
    return new Proxy(target, {
      get(obj, key) {
        console.log(`讀取：${String(key)}`);
        return Reflect.get(obj, key);
      },
      set(obj, key, value) {
        if (key === 'age' && (typeof value !== 'number' || value < 0)) {
          throw new TypeError('age 必須為非負整數');
        }
        console.log(`設定：${String(key)} = ${value}`);
        return Reflect.set(obj, key, value);
      },
      deleteProperty(obj, key) {
        if (key === 'id') throw new Error('不可刪除 id');
        return Reflect.deleteProperty(obj, key);
      }
    });
  }

  const user = createReactive({ id: 1, name: 'Alice', age: 25 });

  user.age  = 26;         // OK
  user.name = 'Bob';      // OK

  try {
    user.age = -1;        // 丟出錯誤
  } catch (e) {
    document.write(`錯誤：${e.message}<br>`);
  }

  document.write(`name=${user.name}, age=${user.age}`);
</script>
</body>
</html>
```

---

## 19. structuredClone 深拷貝

瀏覽器 / Node.js 原生深拷貝 API，支援 Date、Map、Set、ArrayBuffer 等。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8" /><title>structuredClone</title></head>
<body>
<script>
  const original = {
    name: 'Alice',
    scores: [90, 85, 78],
    created: new Date('2026-01-01'),
    meta: new Map([['level', 'gold'], ['point', 500]])
  };

  // 深拷貝（Date、Map 也正確複製）
  const clone = structuredClone(original);

  // 修改複製品不影響原始
  clone.scores.push(100);
  clone.meta.set('level', 'platinum');

  document.write('原始 scores：' + JSON.stringify(original.scores) + '<br>');
  document.write('複製 scores：' + JSON.stringify(clone.scores) + '<br>');
  document.write('原始 level：' + original.meta.get('level') + '<br>');
  document.write('複製 level：' + clone.meta.get('level') + '<br>');
  document.write('Date 正確：' + (clone.created instanceof Date));
</script>
</body>
</html>
```

---

## 20. DOM 操作與事件

現代 DOM API：`querySelector`、`closest`、事件委派、`dataset`。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8" /><title>DOM 操作</title>
<style>
  .item { padding: 8px; margin: 4px; background: #eee; cursor: pointer; }
  .item.active { background: #4CAF50; color: white; }
</style>
</head>
<body>
<ul id="list">
  <li class="item" data-id="1">項目 A</li>
  <li class="item" data-id="2">項目 B</li>
  <li class="item" data-id="3">項目 C</li>
</ul>
<button id="addBtn">新增項目</button>
<p id="info">點擊項目查看 data-id</p>

<script>
  const list = document.getElementById('list');
  const info = document.getElementById('info');
  let counter = 3;

  // 事件委派（delegation）：在父元素監聽，處理子元素事件
  list.addEventListener('click', (e) => {
    const item = e.target.closest('.item');
    if (!item) return;

    // 切換 active 狀態
    document.querySelectorAll('.item').forEach(el => el.classList.remove('active'));
    item.classList.add('active');

    // 讀取 dataset
    info.textContent = `選中 data-id = ${item.dataset.id}`;
  });

  // 動態新增元素
  document.getElementById('addBtn').addEventListener('click', () => {
    counter++;
    const li = document.createElement('li');
    li.className = 'item';
    li.dataset.id = counter;
    li.textContent = `項目 ${String.fromCharCode(64 + counter)}`;
    list.appendChild(li);
  });
</script>
</body>
</html>
```

---

## 21. Web Storage（localStorage / sessionStorage）

在瀏覽器本地儲存資料，無需後端。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8" /><title>Web Storage</title></head>
<body>
<input id="nameInput" placeholder="輸入名稱" />
<button id="save">儲存</button>
<button id="load">讀取</button>
<button id="clear">清除</button>
<p id="msg"></p>

<script>
  const KEY = 'app_user_name';
  const msg = document.getElementById('msg');

  // 儲存（物件需 JSON.stringify）
  document.getElementById('save').addEventListener('click', () => {
    const name = document.getElementById('nameInput').value;
    const data = { name, savedAt: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(data));
    msg.textContent = `已儲存：${name}`;
  });

  // 讀取
  document.getElementById('load').addEventListener('click', () => {
    const raw = localStorage.getItem(KEY);
    if (!raw) { msg.textContent = '找不到資料'; return; }
    const { name, savedAt } = JSON.parse(raw);
    msg.textContent = `名稱：${name}，儲存於 ${savedAt}`;
  });

  // 清除
  document.getElementById('clear').addEventListener('click', () => {
    localStorage.removeItem(KEY);
    msg.textContent = '已清除';
  });

  // 頁面載入時自動讀取
  const existing = localStorage.getItem(KEY);
  if (existing) {
    const { name } = JSON.parse(existing);
    document.getElementById('nameInput').value = name;
  }
</script>
</body>
</html>
```

---

## 22. Intersection Observer API

高效能的元素可見性偵測，用於懶加載、無限捲動、動畫觸發。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8" /><title>Intersection Observer</title>
<style>
  .card {
    height: 150px; margin: 20px; background: #ddd;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.5rem; border-radius: 8px;
    opacity: 0; transform: translateY(40px);
    transition: opacity 0.5s, transform 0.5s;
  }
  .card.visible {
    opacity: 1; transform: translateY(0);
  }
</style>
</head>
<body>
<p>往下捲動查看動畫效果：</p>
<div style="height:80vh"></div>

<script>
  // 建立 10 張卡片
  for (let i = 1; i <= 10; i++) {
    const card = document.createElement('div');
    card.className = 'card';
    card.textContent = `卡片 ${i}`;
    document.body.appendChild(card);
  }

  // 建立 Observer
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target); // 動畫只觸發一次
      }
    });
  }, {
    threshold: 0.2  // 20% 可見時觸發
  });

  document.querySelectorAll('.card').forEach(card => observer.observe(card));
</script>
</body>
</html>
```

---

## 23. Temporal API（ES2025）

取代 `Date` 的新日期時間 API，支援時區、日曆、精確計算。

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8" /><title>Temporal API ES2025</title></head>
<body>
<script>
  // Temporal.Now
  const now    = Temporal.Now.plainDateTimeISO();
  const today  = Temporal.Now.plainDateISO();

  document.write(`現在時間：${now.toString()}<br>`);
  document.write(`今天日期：${today.toString()}<br>`);

  // 建立特定日期
  const birthday = Temporal.PlainDate.from('1990-06-15');
  const age = today.since(birthday, { largestUnit: 'years' });
  document.write(`年齡：${age.years} 歲<br>`);

  // 日期加減（不可變，回傳新物件）
  const nextMonth = today.add({ months: 1 });
  const lastWeek  = today.subtract({ weeks: 1 });
  document.write(`下個月：${nextMonth}<br>`);
  document.write(`上週同日：${lastWeek}<br>`);

  // 時區感知
  const meeting = Temporal.ZonedDateTime.from(
    '2026-06-01T09:00:00[Asia/Taipei]'
  );
  const inTokyo = meeting.withTimeZone('Asia/Tokyo');
  document.write(`台北開會：${meeting.toLocaleString('zh-TW')}<br>`);
  document.write(`東京時間：${inTokyo.toLocaleString('ja-JP')}`);
</script>
</body>
</html>
```

---

## 總結：2026 年值得掌握的 JS 重點

| 類別 | 語法 / API | 版本 |
|------|-----------|------|
| 變數 | `const` / `let` | ES2015 |
| 字串 | Template Literals | ES2015 |
| 函式 | Arrow Functions | ES2015 |
| 解構 | Destructuring, Spread/Rest | ES2015 |
| 類別 | Classes + 私有欄位 `#` | ES2022 |
| 非同步 | `async/await`, `Promise.all` | ES2017 |
| HTTP | Fetch API | ES2015 |
| 安全存取 | Optional Chaining `?.` | ES2020 |
| 預設值 | Nullish Coalescing `??` | ES2020 |
| 陣列 | `at()`, `findLast`, `toSorted`, `toReversed`, `with` | ES2023 |
| 分組 | `Object.groupBy`, `Map.groupBy` | ES2024 |
| Promise | `Promise.withResolvers` | ES2024 |
| 迭代器 | Iterator Helpers | ES2025 |
| 集合 | Set `union/intersection/difference` | ES2025 |
| 日期 | Temporal API | ES2025 |
| 深拷貝 | `structuredClone` | ES2022 |
| 攔截 | `Proxy` / `Reflect` | ES2015 |
| 可見性 | Intersection Observer | Web API |
| 儲存 | `localStorage` / `sessionStorage` | Web API |
