const STORAGE_KEY = "vinted_assistant_items_v1";

const pricingReference = {
  上衣: { "全新带吊牌": [18, 45], 近新: [14, 32], 良好: [9, 22], "明显使用痕迹": [4, 12] },
  裤子: { "全新带吊牌": [22, 55], 近新: [16, 38], 良好: [11, 28], "明显使用痕迹": [5, 15] },
  外套: { "全新带吊牌": [35, 120], 近新: [25, 85], 良好: [15, 60], "明显使用痕迹": [8, 30] },
  裙子: { "全新带吊牌": [20, 58], 近新: [14, 38], 良好: [9, 26], "明显使用痕迹": [4, 15] },
  鞋子: { "全新带吊牌": [28, 90], 近新: [20, 70], 良好: [12, 45], "明显使用痕迹": [6, 25] },
  包包: { "全新带吊牌": [30, 130], 近新: [22, 90], 良好: [14, 65], "明显使用痕迹": [7, 35] },
};

const translations = {
  de: (item) =>
    `${item.brand} ${item.name} in ${item.color}, Größe ${item.size}. Zustand: ${item.condition}. Gepflegtes Teil mit schöner Passform und hochwertigem Material, perfekt für Alltag oder Outfit-Upgrade. Privatverkauf, ehrliche Angaben, sofort versandbereit. Nicht rückgabe, Privatverkauf.`,
  en: (item) =>
    `${item.brand} ${item.name} in ${item.color}, size ${item.size}. Condition: ${item.condition}. Well-kept piece with a flattering fit and quality feel, great for everyday wear or elevating your look. Honest private listing and ready to ship. No returns, private sale.`,
  zh: (item) =>
    `${item.brand}${item.name}，${item.color}，尺码${item.size}。成色：${item.condition}。版型好、质感佳，日常穿搭或提升整体造型都很合适，实物状态维护良好，已整理可直接发货。不退不换，私人出售。`,
};

let items = loadItems();
let pendingPhotos = [];

const form = document.getElementById("item-form");
const photoInput = document.getElementById("photos");
const photoPreview = document.getElementById("photo-preview");
const list = document.getElementById("inventory-list");
const searchInput = document.getElementById("search");
const statusFilter = document.getElementById("status-filter");
const itemSelector = document.getElementById("item-selector");

photoInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []).slice(0, 6);
  pendingPhotos = await Promise.all(files.map(fileToBase64));
  renderPhotoPreview(pendingPhotos);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const item = {
    id: document.getElementById("item-id").value || crypto.randomUUID(),
    name: formData.get("name") || document.getElementById("name").value.trim(),
    brand: document.getElementById("brand").value.trim(),
    category: document.getElementById("category").value,
    size: document.getElementById("size").value.trim(),
    color: document.getElementById("color").value.trim(),
    condition: document.getElementById("condition").value,
    originalPrice: toNumber(document.getElementById("originalPrice").value),
    salePrice: toNumber(document.getElementById("salePrice").value),
    status: document.getElementById("status").value,
    photos: pendingPhotos.length ? pendingPhotos.slice(0, 6) : getExistingPhotos(),
    updatedAt: Date.now(),
  };

  const existingIndex = items.findIndex((x) => x.id === item.id);
  if (existingIndex >= 0) items[existingIndex] = item;
  else items.unshift(item);

  persist();
  resetForm();
  renderAll();
});

searchInput.addEventListener("input", renderInventoryList);
statusFilter.addEventListener("change", renderInventoryList);

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((x) => x.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

document.getElementById("generate-btn").addEventListener("click", () => {
  const item = items.find((x) => x.id === itemSelector.value);
  if (!item) return;
  const lang = document.getElementById("language-selector").value;
  document.getElementById("generated-description").value = translations[lang](item);

  const [low, high] = pricingReference[item.category]?.[item.condition] || [10, 30];
  const quick = roundPrice(low * 0.95);
  const rec = roundPrice((low + high) / 2);
  const max = roundPrice(high * 1.1);

  document.getElementById("price-tiers").innerHTML = `
    <li>快速出售价：€${quick}</li>
    <li>推荐价：€${rec}</li>
    <li>最高尝试价：€${max}</li>
  `;

  document.getElementById("pricing-logic").textContent =
    `逻辑：基于${item.category}在“${item.condition}”成色的常见成交区间 €${low}-€${high}，快速价偏低促进成交，推荐价平衡速度与收益，最高尝试价用于先挂高测试市场接受度。`;
});

function renderAll() {
  renderStats();
  renderInventoryList();
  renderSelector();
  renderPricingReference();
}

function renderStats() {
  const live = items.filter((x) => x.status === "在售中").length;
  const sold = items.filter((x) => x.status === "已售出").length;
  const revenue = items
    .filter((x) => x.status === "已售出")
    .reduce((sum, x) => sum + (Number(x.salePrice) || 0), 0);

  document.getElementById("stat-total").textContent = String(items.length);
  document.getElementById("stat-live").textContent = String(live);
  document.getElementById("stat-sold").textContent = String(sold);
  document.getElementById("stat-revenue").textContent = revenue.toFixed(2);
}

function renderInventoryList() {
  const keyword = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;

  const filtered = items.filter((item) => {
    const hitKeyword = [item.name, item.brand, item.color].join(" ").toLowerCase().includes(keyword);
    const hitStatus = status === "all" || item.status === status;
    return hitKeyword && hitStatus;
  });

  list.innerHTML = filtered
    .map(
      (item) => `
      <li class="inventory-item">
        <strong>${escapeHtml(item.brand)} ${escapeHtml(item.name)}</strong>
        <div class="meta">${item.category} · ${item.size} · ${item.color} · ${item.condition}</div>
        <div class="meta">状态：${item.status} · 售价：€${item.salePrice ?? "-"}</div>
        ${item.photos?.[0] ? `<img src="${item.photos[0]}" alt="cover" style="width:80px;height:80px;object-fit:cover;border-radius:8px;"/>` : ""}
        <div class="item-actions">
          <button class="secondary" onclick="editItem('${item.id}')">编辑</button>
          <button class="danger" onclick="deleteItem('${item.id}')">删除</button>
        </div>
      </li>`
    )
    .join("");

  if (!filtered.length) {
    list.innerHTML = '<li class="inventory-item">暂无匹配商品。</li>';
  }
}

function renderSelector() {
  itemSelector.innerHTML = '<option value="">选择商品</option>' +
    items.map((item) => `<option value="${item.id}">${escapeHtml(item.brand)} ${escapeHtml(item.name)}</option>`).join("");
}

function renderPricingReference() {
  const rows = Object.entries(pricingReference)
    .map(([category, conditions]) => {
      const cells = Object.entries(conditions)
        .map(([condition, range]) => `${condition}: €${range[0]}-€${range[1]}`)
        .join("<br>");
      return `<tr><td>${category}</td><td>${cells}</td></tr>`;
    })
    .join("");

  document.getElementById("pricing-reference").innerHTML = `
    <table class="reference-table">
      <thead><tr><th>类别</th><th>建议价格区间（按成色）</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

window.editItem = function editItem(id) {
  const item = items.find((x) => x.id === id);
  if (!item) return;
  document.getElementById("item-id").value = item.id;
  document.getElementById("name").value = item.name;
  document.getElementById("brand").value = item.brand;
  document.getElementById("category").value = item.category;
  document.getElementById("size").value = item.size;
  document.getElementById("color").value = item.color;
  document.getElementById("condition").value = item.condition;
  document.getElementById("originalPrice").value = item.originalPrice ?? "";
  document.getElementById("salePrice").value = item.salePrice ?? "";
  document.getElementById("status").value = item.status;
  pendingPhotos = item.photos || [];
  renderPhotoPreview(pendingPhotos);
  document.getElementById("inventory-tab").scrollIntoView({ behavior: "smooth", block: "start" });
};

window.deleteItem = function deleteItem(id) {
  items = items.filter((x) => x.id !== id);
  persist();
  renderAll();
};

function renderPhotoPreview(photos) {
  photoPreview.innerHTML = photos
    .slice(0, 6)
    .map((src) => `<img src="${src}" alt="预览图" />`)
    .join("");
}

function resetForm() {
  form.reset();
  document.getElementById("item-id").value = "";
  pendingPhotos = [];
  renderPhotoPreview([]);
}

function getExistingPhotos() {
  const id = document.getElementById("item-id").value;
  return items.find((x) => x.id === id)?.photos || [];
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function loadItems() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function toNumber(value) {
  return value === "" ? null : Number(value);
}

function roundPrice(value) {
  return Math.round(value / 1) * 1;
}

function escapeHtml(str = "") {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

renderAll();
