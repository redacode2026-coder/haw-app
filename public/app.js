/**
 * حزب حماة الوطن - تطبيق إدارة استمارات العضوية وقاعدة البيانات
 * Frontend Application Engine — with Role-Based Auth
 */

let allMembers = [];
let currentViewingMember = null;
let searchDebounceTimer = null;
let currentUser = null;  // { id, username, full_name, role }

// ----------------- XSS Protection -----------------
function escapeHtml(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

// Egyptian National ID Governorate Mapping
const GOVERNORATE_CODES = {
  "01": "القاهرة", "02": "الإسكندرية", "03": "بورسعيد", "04": "السويس",
  "11": "دمياط", "12": "الدقهلية", "13": "الشرقية", "14": "القليوبية",
  "15": "كفر الشيخ", "16": "الغربية", "17": "المنوفية", "18": "البحيرة",
  "19": "الإسماعيلية", "21": "الجيزة", "22": "بني سويف", "23": "الفيوم",
  "24": "المنيا", "25": "أسيوط", "26": "سوهاج", "27": "قنا",
  "28": "أسوان", "29": "الأقصر", "31": "البحر الأحمر", "32": "الوادي الجديد",
  "33": "مطروح", "34": "شمال سيناء", "35": "جنوب سيناء"
};

// الدوائر الانتخابية لمحافظة البحيرة
const BEHEIRA_DISTRICTS = [
  "بندر دمنهور",
  "مركز دمنهور",
  "ايتاي البارود",
  "الدلنجات",
  "كوم حمادة",
  "شبراخيت",
  "الرحمانية",
  "المحمودية",
  "رشيد",
  "ادكو",
  "بندر كفر الدوار",
  "مركز كفر الدوار",
  "ابوحمص",
  "حوش عيسى",
  "ابو المطامير",
  "النوبارية",
  "بدر",
  "وادى النطرون"
];

// Initialize App
document.addEventListener("DOMContentLoaded", async () => {
  // --- Auth guard: verify session before loading anything ---
  await initAuth();

  setupNavigation();
  setupFormListeners();
  setupNationalIdListener();
  setupRenewalSearch();
  handleGovernorateChange();
  fetchMembers();
  fetchStats();
  setCurrentPledgeDate();

  // Apply permissions to UI after loading
  applyPermissions();
});

// ----------------- Electoral District (Combobox) Handlers -----------------
function handleGovernorateChange() {
  const govSelect = document.getElementById("governorate");
  const districtSelect = document.getElementById("electoral_district");
  const customInput = document.getElementById("electoral_district_custom");

  if (!govSelect || !districtSelect) return;

  const gov = govSelect.value;
  if (gov === "البحيرة") {
    districtSelect.innerHTML = `
      <option value="">-- اختر المركز أو الدائرة الانتخابية (محافظة البحيرة) --</option>
      ${BEHEIRA_DISTRICTS.map(d => `<option value="${d}">${d}</option>`).join("\n      ")}
      <option value="other">مركز / دائرة أخرى (كتابة يدوية)...</option>
    `;
    if (customInput) {
      customInput.style.display = "none";
      customInput.value = "";
    }
  } else {
    districtSelect.innerHTML = `
      <option value="">-- اختر المركز / الدائرة أو اكتبها --</option>
      <option value="other" selected>كتابة اسم المركز / الدائرة يدوياً...</option>
    `;
    if (customInput) {
      customInput.style.display = "block";
      customInput.placeholder = `اكتب اسم المركز / الدائرة بمحافظة ${gov}...`;
    }
  }
}

function handleElectoralDistrictChange() {
  const districtSelect = document.getElementById("electoral_district");
  const customInput = document.getElementById("electoral_district_custom");
  if (!districtSelect || !customInput) return;

  if (districtSelect.value === "other") {
    customInput.style.display = "block";
    customInput.focus();
  } else {
    customInput.style.display = "none";
    customInput.value = "";
  }
}

function getElectoralDistrictValue() {
  const districtSelect = document.getElementById("electoral_district");
  const customInput = document.getElementById("electoral_district_custom");
  if (!districtSelect) return "";

  if (districtSelect.value === "other") {
    return customInput ? customInput.value.trim() : "";
  }
  return districtSelect.value.trim();
}

function setElectoralDistrictValue(val, gov) {
  const govSelect = document.getElementById("governorate");
  if (govSelect && gov) {
    govSelect.value = gov;
  }
  handleGovernorateChange();

  const districtSelect = document.getElementById("electoral_district");
  const customInput = document.getElementById("electoral_district_custom");
  if (!districtSelect) return;

  if (!val) {
    districtSelect.value = "";
    if (customInput) {
      customInput.style.display = "none";
      customInput.value = "";
    }
    return;
  }

  let matched = false;
  for (let opt of districtSelect.options) {
    if (opt.value === val) {
      districtSelect.value = val;
      matched = true;
      break;
    }
  }

  if (matched) {
    if (customInput) {
      customInput.style.display = "none";
      customInput.value = "";
    }
  } else {
    districtSelect.value = "other";
    if (customInput) {
      customInput.style.display = "block";
      customInput.value = val;
    }
  }
}

function handleFilterGovChange() {
  const filterGov = document.getElementById("filter-governorate").value;
  const filterDist = document.getElementById("filter-district");
  const filterDistItem = document.getElementById("filter-district-item");

  if (filterDistItem && filterDist) {
    if (filterGov && filterGov !== "البحيرة") {
      filterDist.value = "";
      filterDistItem.style.display = "none";
    } else {
      filterDistItem.style.display = "block";
    }
  }
  fetchMembers();
}

// ----------------- Navigation & Tabs -----------------
function setupNavigation() {
  const tabs = document.querySelectorAll(".nav-tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-target");
      switchTab(target);
    });
  });
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-pane").forEach(pane => {
    pane.classList.remove("active");
    if (pane.id === tabId) pane.style.display = '';
  });
  document.querySelectorAll(".nav-tab").forEach(tab => tab.classList.remove("active"));

  const targetPane = document.getElementById(tabId);
  if (targetPane) targetPane.classList.add("active");

  const activeBtn = document.querySelector(`.nav-tab[data-target="${tabId}"]`);
  if (activeBtn) activeBtn.classList.add("active");

  if (tabId === "tab-database") {
    fetchMembers();
  } else if (tabId === "tab-stats") {
    fetchStats();
  } else if (tabId === "tab-users") {
    fetchUsers();
  }
}

// ----------------- Date & Name Sync -----------------
function setCurrentPledgeDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const str = `${y} / ${m} / ${d}`;
  
  const el = document.getElementById("pledge-date-val");
  if (el) el.textContent = str;

  const printEl = document.getElementById("print-date-display");
  if (printEl) printEl.textContent = `${d} / ${m} / ${y}`;
}

// ----------------- Egyptian National ID Auto-Parser -----------------
function setupNationalIdListener() {
  const nidInput = document.getElementById("national_id");
  const birthInput = document.getElementById("birth_date");
  const govSelect = document.getElementById("governorate");
  const nidHint = document.getElementById("nid-hint");

  nidInput.addEventListener("input", (e) => {
    const val = e.target.value.replace(/\D/g, "");
    e.target.value = val;

    if (val.length === 14) {
      const centuryDigit = parseInt(val[0], 10);
      const yearPart = val.substring(1, 3);
      const monthPart = val.substring(3, 5);
      const dayPart = val.substring(5, 7);
      const govCode = val.substring(7, 9);

      let fullYear = (centuryDigit === 2 ? 1900 : 2000) + parseInt(yearPart, 10);
      const birthDateStr = `${fullYear}-${monthPart}-${dayPart}`;

      if (birthInput && !birthInput.value) {
        birthInput.value = birthDateStr;
      }

      if (GOVERNORATE_CODES[govCode]) {
        const govName = GOVERNORATE_CODES[govCode];
        if (govSelect) {
          for (let option of govSelect.options) {
            if (option.value === govName) {
              govSelect.value = govName;
              handleGovernorateChange();
              break;
            }
          }
        }
        nidHint.textContent = `✅ رقم قومي صحيح (تاريخ الميلاد: ${birthDateStr} - المحافظة: ${govName})`;
        nidHint.style.color = "#059669";
      }
    } else {
      nidHint.textContent = "سيتم استنتاج تاريخ الميلاد والمحافظة تلقائياً من الرقم القومي";
      nidHint.style.color = "";
    }
  });

  // Sync full name to pledge
  const nameInput = document.getElementById("full_name");
  nameInput.addEventListener("input", (e) => {
    const val = e.target.value.trim();
    document.getElementById("pledge-name-val").textContent = val || "مقدم الطلب";
  });
}

// ----------------- Conditional Toggles -----------------
function togglePartiesDetails(show) {
  const box = document.getElementById("parties-details-box");
  if (show) {
    box.classList.remove("hidden");
  } else {
    box.classList.add("hidden");
  }
}

function toggleElectionsDetails(show) {
  const box = document.getElementById("elections-details-box");
  if (show) {
    box.classList.remove("hidden");
  } else {
    box.classList.add("hidden");
  }
}

// ----------------- File Previews -----------------
function handleFilePreview(input, imgElementId) {
  const file = input.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById(imgElementId).src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}

// ----------------- Form Submission & Saving -----------------
function setupFormListeners() {
  const form = document.getElementById("membership-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveMemberApplication(false);
  });
}

async function getBase64Image(imgElementId) {
  const img = document.getElementById(imgElementId);
  if (!img || !img.src || img.src.includes("assets/badge.jpg") || img.src.includes("badge.jpg")) {
    return "";
  }
  return img.src;
}

async function saveMemberApplication(andPrint = false) {
  const form = document.getElementById("membership-form");
  const fullName = document.getElementById("full_name").value.trim();
  const nationalId = document.getElementById("national_id").value.trim();
  const mobile = document.getElementById("mobile").value.trim();

  if (!fullName) {
    showToast("يرجى إدخال الاسم رباعياً", "error");
    document.getElementById("full_name").focus();
    return false;
  }

  if (!nationalId || nationalId.length !== 14) {
    showToast("يرجى إدخال الرقم القومي صحيحاً (14 رقم)", "error");
    document.getElementById("national_id").focus();
    return false;
  }

  if (!mobile) {
    showToast("يرجى إدخال رقم المحمول", "error");
    document.getElementById("mobile").focus();
    return false;
  }

  const pledgeAgreed = document.getElementById("pledge-agreed").checked;
  if (!pledgeAgreed) {
    showToast("يرجى الموافقة على نص الإقرار وصحة البيانات", "error");
    return false;
  }

  // Collect checked activities
  const activityCheckboxes = document.querySelectorAll('input[name="activities"]:checked');
  const activities = Array.from(activityCheckboxes).map(cb => cb.value);

  // Collect previous parties
  const prevPartiesStatus = document.querySelector('input[name="previous_parties_status"]:checked').value;
  const prevPartiesDetails = [
    document.getElementById("prev_party_1").value.trim(),
    document.getElementById("prev_party_2").value.trim(),
    document.getElementById("prev_party_3").value.trim(),
    document.getElementById("prev_party_4").value.trim()
  ];

  // Collect election candidacies
  const electionsStatus = document.querySelector('input[name="elections_nomination_status"]:checked').value;
  const electionCheckboxes = document.querySelectorAll('input[name="elections_entities"]:checked');
  const electionsEntities = Array.from(electionCheckboxes).map(cb => cb.value);
  const electionsOther = document.getElementById("elections_other_entity").value.trim();
  const electionsDetails = document.getElementById("elections_details").value.trim();

  const photoBase64 = await getBase64Image("preview_photo");
  const nidPhotoBase64 = await getBase64Image("preview_national_id");

  const editId = document.getElementById("edit-member-id").value;

  const payload = {
    full_name: fullName,
    nickname: document.getElementById("nickname").value.trim(),
    national_id: nationalId,
    id_issued_by: document.getElementById("id_issued_by").value.trim(),
    id_issue_date: document.getElementById("id_issue_date").value,
    email: document.getElementById("email").value.trim(),
    birth_date: document.getElementById("birth_date").value,
    address: document.getElementById("address").value.trim(),
    governorate: document.getElementById("governorate").value,
    electoral_district: getElectoralDistrictValue(),
    syndicate: document.getElementById("syndicate").value.trim(),
    qualification: document.getElementById("qualification").value.trim(),
    job_title: document.getElementById("job_title").value.trim(),
    workplace: document.getElementById("workplace").value.trim(),
    work_sector: document.getElementById("work_sector").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    mobile: mobile,
    public_positions: document.getElementById("public_positions").value.trim(),
    activities: activities,
    previous_parties_status: prevPartiesStatus,
    previous_parties_details: prevPartiesDetails,
    elections_nomination_status: electionsStatus,
    elections_entities: electionsEntities,
    elections_other_entity: electionsOther,
    elections_details: electionsDetails,
    endorser_name: document.getElementById("endorser_name").value.trim(),
    endorser_title: document.getElementById("endorser_title").value.trim(),
    photo_url: photoBase64,
    national_id_photo_url: nidPhotoBase64
  };

  const btnSubmit = document.getElementById("btn-submit-form");
  btnSubmit.disabled = true;
  btnSubmit.textContent = "⏳ جاري الحفظ في قاعدة البيانات...";

  try {
    const url = editId ? `/api/members/${editId}` : "/api/members";
    const method = editId ? "PUT" : "POST";

    const response = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.success) {
      showToast(editId ? "تم تحديث بيانات العضو بنجاح!" : "تم حفظ استمارة العضوية بنجاح في قاعدة البيانات!", "success");
      
      // Update printable replica
      payload.membership_number = result.membership_number || "HW-BH-2026";
      payload.created_at = new Date().toISOString();
      renderPrintableSheet(payload);

      if (andPrint) {
        switchTab("tab-print-preview");
        setTimeout(() => window.print(), 500);
      } else {
        resetForm();
        switchTab("tab-database");
      }
      fetchMembers();
      fetchStats();
      return true;
    } else {
      showToast(result.error || "حدث خطأ أثناء الحفظ", "error");
      return false;
    }
  } catch (err) {
    showToast("تعذر الاتصال بالخادم: " + err.message, "error");
    return false;
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "💾 حفظ وتسجيل الاستمارة في قاعدة البيانات";
  }
}

async function saveAndPrintPreview() {
  const ok = await saveMemberApplication(true);
}

// ----------------- Membership Mode: New vs Existing (Renewal) -----------------
let currentMembershipMode = "new";

function setupRenewalSearch() {
  const renewInput = document.getElementById("renew-search-input");
  if (renewInput) {
    renewInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        searchExistingMember();
      }
    });

    // Auto-search on 14 digit National ID
    renewInput.addEventListener("input", (e) => {
      const val = e.target.value.trim();
      if (/^\d{14}$/.test(val)) {
        searchExistingMember();
      }
    });
  }
}

function setMembershipMode(mode) {
  currentMembershipMode = mode;
  const cardNew = document.getElementById("card-mode-new");
  const cardRenew = document.getElementById("card-mode-renew");
  const searchBox = document.getElementById("renewal-search-box");
  const formHeading = document.getElementById("form-main-heading");
  const modeLabel = document.getElementById("form-mode-label");
  const btnSubmit = document.getElementById("btn-submit-form");
  const alertBox = document.getElementById("renew-alert-box");
  const resultsBox = document.getElementById("renew-search-results");

  if (mode === "new") {
    cardNew.classList.add("active");
    cardRenew.classList.remove("active");
    document.querySelector('input[name="membership_mode"][value="new"]').checked = true;
    
    searchBox.classList.add("hidden");
    alertBox.classList.add("hidden");
    resultsBox.classList.add("hidden");
    
    formHeading.textContent = "استمارة طلب عضوية (طلب انضمام جديد)";
    modeLabel.textContent = "طلب انضمام جديد";
    btnSubmit.innerHTML = "💾 حفظ وتسجيل الاستمارة في قاعدة البيانات";
    
    resetForm(false);
    showToast("تم التحويل إلى وضع: طلب انضمام لعضو جديد", "success");
  } else {
    cardRenew.classList.add("active");
    cardNew.classList.remove("active");
    document.querySelector('input[name="membership_mode"][value="renew"]').checked = true;
    
    searchBox.classList.remove("hidden");
    formHeading.textContent = "استمارة تجديد العضوية وتحديث البيانات (عضو مسجل)";
    modeLabel.textContent = "تجديد عضوية مسجلة";
    btnSubmit.innerHTML = "🔄 حفظ وتجديد العضوية في قاعدة البيانات";

    const renewInput = document.getElementById("renew-search-input");
    renewInput.focus();
    showToast("يرجى إدخال الرقم القومي أو الاسم لاسترجاع البيانات وتجديد العضوية", "success");
  }
}

async function searchExistingMember() {
  const input = document.getElementById("renew-search-input");
  const query = input.value.trim();
  const alertBox = document.getElementById("renew-alert-box");
  const resultsBox = document.getElementById("renew-search-results");
  const btnSearch = document.getElementById("btn-renew-search");

  if (!query) {
    alertBox.className = "renew-alert-box error";
    alertBox.innerHTML = "⚠️ يرجى إدخال الرقم القومي (١٤ رقم) أو الاسم أو رقم العضوية للبحث";
    alertBox.classList.remove("hidden");
    input.focus();
    return;
  }

  btnSearch.disabled = true;
  btnSearch.innerHTML = "⏳ جاري البحث...";
  alertBox.classList.add("hidden");
  resultsBox.classList.add("hidden");

  try {
    const res = await fetch(`/api/members?search=${encodeURIComponent(query)}`);
    const result = await res.json();

    if (result.success && result.data && result.data.length > 0) {
      if (result.data.length === 1) {
        // Exact 1 match: load directly
        loadMemberIntoForm(result.data[0]);
      } else {
        // Multiple matches: show dropdown list
        resultsBox.innerHTML = "";
        result.data.forEach(m => {
          const item = document.createElement("div");
          item.className = "dropdown-result-item";
          item.innerHTML = `
            <div>
              <strong>${escapeHtml(m.full_name)}</strong>
              <div class="item-meta">الرقم القومي: ${escapeHtml(m.national_id)} &bull; رقم العضوية: ${escapeHtml(m.membership_number || "HW-" + m.id)}</div>
            </div>
            <button type="button" class="btn btn-primary btn-sm">اختيار وتعبئة ⚡</button>
          `;
          item.onclick = () => {
            loadMemberIntoForm(m);
            resultsBox.classList.add("hidden");
          };
          resultsBox.appendChild(item);
        });
        resultsBox.classList.remove("hidden");
        alertBox.className = "renew-alert-box success";
        alertBox.innerHTML = `🔍 تم العثور على (${result.data.length}) أعضاء. يرجى اختيار العضو المطلوب من القائمة أعلاه.`;
        alertBox.classList.remove("hidden");
      }
    } else {
      alertBox.className = "renew-alert-box error";
      alertBox.innerHTML = `❌ لم يتم العثور على أي عضو مسجل بالبيانات: "<strong>${escapeHtml(query)}</strong>". يرجى التحقق من الرقم القومي أو الاسم، أو اختيار "عضو جديد" لتسجيل طلب جديد.`;
      alertBox.classList.remove("hidden");
    }
  } catch (err) {
    alertBox.className = "renew-alert-box error";
    alertBox.innerHTML = "تعذر الاتصال بقاعدة البيانات: " + err.message;
    alertBox.classList.remove("hidden");
  } finally {
    btnSearch.disabled = false;
    btnSearch.innerHTML = "⚡ بحث واسترجاع البيانات";
  }
}

function loadMemberIntoForm(m) {
  const alertBox = document.getElementById("renew-alert-box");
  const resultsBox = document.getElementById("renew-search-results");
  resultsBox.classList.add("hidden");

  document.getElementById("edit-member-id").value = m.id;
  document.getElementById("form-display-number").textContent = m.membership_number || "HW-BH-2026-" + m.id;
  document.getElementById("full_name").value = m.full_name || "";
  document.getElementById("nickname").value = m.nickname || "";
  document.getElementById("national_id").value = m.national_id || "";
  document.getElementById("id_issued_by").value = m.id_issued_by || "";
  document.getElementById("id_issue_date").value = m.id_issue_date || "";
  document.getElementById("email").value = m.email || "";
  document.getElementById("birth_date").value = m.birth_date || "";
  document.getElementById("address").value = m.address || "";
  setElectoralDistrictValue(m.electoral_district || "", m.governorate || "البحيرة");
  document.getElementById("syndicate").value = m.syndicate || "";
  document.getElementById("qualification").value = m.qualification || "";
  document.getElementById("job_title").value = m.job_title || "";
  document.getElementById("workplace").value = m.workplace || "";
  document.getElementById("work_sector").value = m.work_sector || "";
  document.getElementById("phone").value = m.phone || "";
  document.getElementById("mobile").value = m.mobile || "";
  document.getElementById("public_positions").value = m.public_positions || "";

  // Activities
  const acts = Array.isArray(m.activities) ? m.activities : [];
  document.querySelectorAll('input[name="activities"]').forEach(cb => {
    cb.checked = acts.includes(cb.value);
  });

  // Parties
  if (m.previous_parties_status === "yes") {
    document.querySelector('input[name="previous_parties_status"][value="yes"]').checked = true;
    togglePartiesDetails(true);
    const parties = Array.isArray(m.previous_parties_details) ? m.previous_parties_details : ["", "", "", ""];
    document.getElementById("prev_party_1").value = parties[0] || "";
    document.getElementById("prev_party_2").value = parties[1] || "";
    document.getElementById("prev_party_3").value = parties[2] || "";
    document.getElementById("prev_party_4").value = parties[3] || "";
  } else {
    document.querySelector('input[name="previous_parties_status"][value="no"]').checked = true;
    togglePartiesDetails(false);
  }

  // Elections
  if (m.elections_nomination_status === "yes") {
    document.querySelector('input[name="elections_nomination_status"][value="yes"]').checked = true;
    toggleElectionsDetails(true);
    const elEntities = Array.isArray(m.elections_entities) ? m.elections_entities : [];
    document.querySelectorAll('input[name="elections_entities"]').forEach(cb => {
      cb.checked = elEntities.includes(cb.value);
    });
    document.getElementById("elections_other_entity").value = m.elections_other_entity || "";
    document.getElementById("elections_details").value = m.elections_details || "";
  } else {
    document.querySelector('input[name="elections_nomination_status"][value="no"]').checked = true;
    toggleElectionsDetails(false);
  }

  document.getElementById("endorser_name").value = m.endorser_name || "";
  document.getElementById("endorser_title").value = m.endorser_title || "";

  if (m.photo_url) document.getElementById("preview_photo").src = m.photo_url;
  if (m.national_id_photo_url) document.getElementById("preview_national_id").src = m.national_id_photo_url;

  document.getElementById("pledge-name-val").textContent = m.full_name;

  // Show status banner
  alertBox.className = "renew-alert-box success";
  alertBox.innerHTML = `✅ تم استرجاع بيانات العضو بنجاح: <strong>${escapeHtml(m.full_name)}</strong> (رقم العضوية: <strong>${escapeHtml(m.membership_number || 'HW-' + m.id)}</strong>). تم ملء الاستمارة بالكامل ويمكنك تعديل أو تجديد البيانات.`;
  alertBox.classList.remove("hidden");

  // Update printable sheet
  renderPrintableSheet(m);

  showToast(`تم استرجاع بيانات العضو: ${m.full_name}`, "success");

  // Smooth scroll to form fields
  document.getElementById("membership-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetForm(resetMode = true) {
  document.getElementById("membership-form").reset();
  document.getElementById("edit-member-id").value = "";
  document.getElementById("form-display-number").textContent = "HW-BH-2026-XXXX";
  setElectoralDistrictValue("", "البحيرة");
  document.getElementById("preview_photo").src = "assets/badge.jpg";
  document.getElementById("preview_national_id").src = "assets/badge.jpg";
  document.getElementById("pledge-name-val").textContent = "مقدم الطلب";
  togglePartiesDetails(false);
  toggleElectionsDetails(false);
  document.getElementById("nid-hint").textContent = "سيتم استنتاج تاريخ الميلاد والمحافظة تلقائياً من الرقم القومي";
  document.getElementById("nid-hint").style.color = "";

  if (resetMode) {
    setMembershipMode("new");
    const renewInput = document.getElementById("renew-search-input");
    if (renewInput) renewInput.value = "";
    const alertBox = document.getElementById("renew-alert-box");
    if (alertBox) alertBox.classList.add("hidden");
    const resultsBox = document.getElementById("renew-search-results");
    if (resultsBox) resultsBox.classList.add("hidden");
  }
}

// ----------------- Fetch & Render Members Table -----------------
async function fetchMembers() {
  const search = document.getElementById("search-input").value.trim();
  const activity = document.getElementById("filter-activity").value;
  const status = document.getElementById("filter-status").value;
  const governorate = document.getElementById("filter-governorate").value;
  const district = document.getElementById("filter-district") ? document.getElementById("filter-district").value : "";

  const tableBody = document.getElementById("members-table-body");
  const loading = document.getElementById("table-loading");
  const empty = document.getElementById("table-empty");

  loading.classList.remove("hidden");
  empty.classList.add("hidden");
  tableBody.innerHTML = "";

  try {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (activity) params.append("activity", activity);
    if (status) params.append("status", status);
    if (governorate) params.append("governorate", governorate);
    if (district) params.append("district", district);

    const res = await fetch(`/api/members?${params.toString()}`);
    const result = await res.json();

    loading.classList.add("hidden");

    if (result.success && result.data.length > 0) {
      allMembers = result.data;
      document.getElementById("header-member-count").textContent = result.data.length;
      renderTableRows(result.data);
    } else {
      empty.classList.remove("hidden");
      document.getElementById("header-member-count").textContent = "0";
    }
  } catch (err) {
    loading.classList.add("hidden");
    showToast("تعذر تحميل البيانات من قاعدة البيانات", "error");
  }
}

function renderTableRows(members) {
  const tbody = document.getElementById("members-table-body");
  tbody.innerHTML = "";

  members.forEach((m, idx) => {
    const tr = document.createElement("tr");

    const acts = Array.isArray(m.activities) ? m.activities : [];
    const actsHtml = acts.map(a => `<span class="act-tag">${escapeHtml(a)}</span>`).join(" ");

    const statusClass = `status-${String(m.status || '').replace(/\s+/g, "-")}`;

    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><span class="member-code-tag">${escapeHtml(m.membership_number || "HW-" + m.id)}</span></td>
      <td class="member-name-cell">${escapeHtml(m.full_name)}</td>
      <td style="font-family: monospace;">${escapeHtml(m.national_id)}</td>
      <td>${escapeHtml(m.governorate || "البحيرة")} ${m.electoral_district ? "(" + escapeHtml(m.electoral_district) + ")" : ""}</td>
      <td dir="ltr" style="text-align: right;">${escapeHtml(m.mobile || "-")}</td>
      <td>${escapeHtml(m.job_title || "-")}</td>
      <td>${actsHtml || "<span class='text-muted'>-</span>"}</td>
      <td><span class="status-badge ${statusClass}">${escapeHtml(m.status)}</span></td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-secondary btn-sm" onclick="viewMemberDetails(${parseInt(m.id)})" title="عرض التفاصيل الكاملة">👁️</button>
          <button class="btn btn-primary btn-sm" onclick="printMemberDirect(${parseInt(m.id)})" title="طباعة الاستمارة الرسمية A4">🖨️</button>
          <button class="btn btn-outline btn-sm" style="color: var(--navy-dark); border-color: var(--border-color);" onclick="editMember(${parseInt(m.id)})" title="تعديل">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteMember(${parseInt(m.id)})" title="حذف">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function debounceSearch() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    fetchMembers();
  }, 300);
}

function resetFilters() {
  document.getElementById("search-input").value = "";
  document.getElementById("filter-activity").value = "";
  document.getElementById("filter-status").value = "";
  document.getElementById("filter-governorate").value = "";
  const filterDist = document.getElementById("filter-district");
  if (filterDist) filterDist.value = "";
  const filterDistItem = document.getElementById("filter-district-item");
  if (filterDistItem) filterDistItem.style.display = "block";
  fetchMembers();
}

async function exportCSV() {
  if (!canDo('export_data')) {
    showToast('ليس لديك صلاحية تصدير البيانات', 'error');
    return;
  }
  try {
    const res = await fetch('/api/export');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'تعذر تصدير البيانات', 'error');
      return;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const contentType = res.headers.get('Content-Type') || '';
    const ext = contentType.includes('sheet') ? 'xlsx' : 'csv';
    a.download = 'homat_alwatan_members.' + ext;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showToast('تم تصدير البيانات بنجاح', 'success');
  } catch (e) {
    showToast('تعذر الاتصال بالخادم', 'error');
  }
}

// ----------------- Member Actions (View, Edit, Delete, Print) -----------------
async function viewMemberDetails(id) {
  try {
    const res = await fetch(`/api/members/${id}`);
    const result = await res.json();
    if (result.success) {
      const m = result.data;
      currentViewingMember = m;

      const modalTitle = document.getElementById("modal-member-title");
      modalTitle.textContent = `استمارة عضوية: ${m.full_name} (${m.membership_number || "HW-" + m.id})`;

      const modalBody = document.getElementById("modal-member-body");
      const acts = Array.isArray(m.activities) ? m.activities.join(" ، ") : "-";
      const parties = Array.isArray(m.previous_parties_details) ? m.previous_parties_details.filter(p => p).join(" ، ") : "-";
      const elections = Array.isArray(m.elections_entities) ? m.elections_entities.join(" ، ") : "-";

      modalBody.innerHTML = `
        <div style="display: flex; gap: 1.5rem; align-items: center; margin-bottom: 1.5rem; background: var(--bg-page); padding: 1rem; border-radius: var(--radius-md); flex-wrap: wrap;">
          <img src="${escapeHtml(m.photo_url || 'assets/badge.jpg')}" style="width: 75px; height: 75px; border-radius: 50%; object-fit: cover; border: 2px solid var(--primary-gold);" alt="صورة العضو">
          <div>
            <h4 style="font-size: 1.25rem; margin-bottom: 4px; color: var(--navy-dark);">${escapeHtml(m.full_name)}</h4>
            <p style="color: var(--text-muted); font-size: 0.9rem;">الرقم القومي: <strong>${escapeHtml(m.national_id)}</strong> &bull; المحافظة: <strong>${escapeHtml(m.governorate || 'البحيرة')}</strong></p>
            <p style="font-size: 0.85rem; margin-top: 4px;">حالة الطلب: <span class="status-badge status-${String(m.status || '').replace(/\s+/g, '-')}">${escapeHtml(m.status)}</span></p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; font-size: 0.95rem;">
          <div><strong>اسم الشهرة:</strong> ${escapeHtml(m.nickname || '-')}</div>
          <div><strong>صادر من:</strong> ${escapeHtml(m.id_issued_by || '-')} (بتاريخ: ${escapeHtml(m.id_issue_date || '-')})</div>
          <div><strong>البريد الإلكتروني:</strong> ${escapeHtml(m.email || '-')}</div>
          <div><strong>تاريخ الميلاد:</strong> ${escapeHtml(m.birth_date || '-')}</div>
          <div><strong>محل الإقامة:</strong> ${escapeHtml(m.address || '-')}</div>
          <div><strong>الدائرة الانتخابية:</strong> ${escapeHtml(m.electoral_district || '-')}</div>
          <div><strong>النقابة:</strong> ${escapeHtml(m.syndicate || '-')}</div>
          <div><strong>المؤهل العلمي:</strong> ${escapeHtml(m.qualification || '-')}</div>
          <div><strong>الوظيفة:</strong> ${escapeHtml(m.job_title || '-')}</div>
          <div><strong>محل العمل:</strong> ${escapeHtml(m.workplace || '-')}</div>
          <div><strong>المحمول:</strong> ${escapeHtml(m.mobile || '-')}</div>
          <div><strong>التليفون:</strong> ${escapeHtml(m.phone || '-')}</div>
        </div>

        <hr style="margin: 1rem 0; border: none; border-top: 1px solid var(--border-light);">

        <div style="font-size: 0.95rem; line-height: 1.6;">
          <p style="margin-bottom: 6px;"><strong>الأنشطة واللجان المختارة:</strong> ${escapeHtml(acts)}</p>
          <p style="margin-bottom: 6px;"><strong>انتماء حزبي سابق:</strong> ${m.previous_parties_status === 'yes' ? 'نعم (' + escapeHtml(parties) + ')' : 'لا'}</p>
          <p style="margin-bottom: 6px;"><strong>ترشح لانتخابات سابقة:</strong> ${m.elections_nomination_status === 'yes' ? 'نعم (' + escapeHtml(elections) + ')' : 'لا'}</p>
          ${m.elections_details ? '<p style="margin-bottom: 6px;"><strong>تفاصيل الترشح:</strong> ' + escapeHtml(m.elections_details) + '</p>' : ''}
          <p style="margin-bottom: 6px;"><strong>مؤيد الطلب:</strong> ${escapeHtml(m.endorser_name || '-')} (${escapeHtml(m.endorser_title || '-')})</p>
        </div>
      `;

      document.getElementById("modal-btn-print").onclick = () => {
        closeMemberModal();
        printMemberDirect(m.id);
      };

      document.getElementById("member-detail-modal").showModal();
    }
  } catch (err) {
    showToast("تعذر تحميل تفاصيل العضو", "error");
  }
}

function closeMemberModal() {
  document.getElementById("member-detail-modal").close();
}

async function editMember(id) {
  try {
    const res = await fetch(`/api/members/${id}`);
    const result = await res.json();
    if (result.success) {
      const m = result.data;
      document.getElementById("edit-member-id").value = m.id;
      document.getElementById("form-display-number").textContent = m.membership_number || "HW-BH-2026-" + m.id;
      document.getElementById("full_name").value = m.full_name || "";
      document.getElementById("nickname").value = m.nickname || "";
      document.getElementById("national_id").value = m.national_id || "";
      document.getElementById("id_issued_by").value = m.id_issued_by || "";
      document.getElementById("id_issue_date").value = m.id_issue_date || "";
      document.getElementById("email").value = m.email || "";
      document.getElementById("birth_date").value = m.birth_date || "";
      document.getElementById("address").value = m.address || "";
      setElectoralDistrictValue(m.electoral_district || "", m.governorate || "البحيرة");
      document.getElementById("syndicate").value = m.syndicate || "";
      document.getElementById("qualification").value = m.qualification || "";
      document.getElementById("job_title").value = m.job_title || "";
      document.getElementById("workplace").value = m.workplace || "";
      document.getElementById("work_sector").value = m.work_sector || "";
      document.getElementById("phone").value = m.phone || "";
      document.getElementById("mobile").value = m.mobile || "";
      document.getElementById("public_positions").value = m.public_positions || "";

      // Activities
      const acts = Array.isArray(m.activities) ? m.activities : [];
      document.querySelectorAll('input[name="activities"]').forEach(cb => {
        cb.checked = acts.includes(cb.value);
      });

      // Parties
      if (m.previous_parties_status === "yes") {
        document.querySelector('input[name="previous_parties_status"][value="yes"]').checked = true;
        togglePartiesDetails(true);
        const parties = Array.isArray(m.previous_parties_details) ? m.previous_parties_details : ["", "", "", ""];
        document.getElementById("prev_party_1").value = parties[0] || "";
        document.getElementById("prev_party_2").value = parties[1] || "";
        document.getElementById("prev_party_3").value = parties[2] || "";
        document.getElementById("prev_party_4").value = parties[3] || "";
      } else {
        document.querySelector('input[name="previous_parties_status"][value="no"]').checked = true;
        togglePartiesDetails(false);
      }

      // Elections
      if (m.elections_nomination_status === "yes") {
        document.querySelector('input[name="elections_nomination_status"][value="yes"]').checked = true;
        toggleElectionsDetails(true);
        const elEntities = Array.isArray(m.elections_entities) ? m.elections_entities : [];
        document.querySelectorAll('input[name="elections_entities"]').forEach(cb => {
          cb.checked = elEntities.includes(cb.value);
        });
        document.getElementById("elections_other_entity").value = m.elections_other_entity || "";
        document.getElementById("elections_details").value = m.elections_details || "";
      } else {
        document.querySelector('input[name="elections_nomination_status"][value="no"]').checked = true;
        toggleElectionsDetails(false);
      }

      document.getElementById("endorser_name").value = m.endorser_name || "";
      document.getElementById("endorser_title").value = m.endorser_title || "";

      if (m.photo_url) document.getElementById("preview_photo").src = m.photo_url;
      if (m.national_id_photo_url) document.getElementById("preview_national_id").src = m.national_id_photo_url;

      document.getElementById("pledge-name-val").textContent = m.full_name;

      switchTab("tab-form");
      showToast("تم تحميل بيانات الاستمارة للتعديل", "success");
    }
  } catch (err) {
    showToast("تعذر تحميل بيانات العضو", "error");
  }
}

async function deleteMember(id) {
  if (!confirm("هل أنت متأكد من رغبتك في حذف هذا السجل من قاعدة البيانات نهائياً؟")) {
    return;
  }

  try {
    const res = await fetch(`/api/members/${id}`, { method: "DELETE" });
    const result = await res.json();
    if (result.success) {
      showToast("تم حذف السجل بنجاح", "success");
      fetchMembers();
      fetchStats();
    } else {
      showToast(result.error || "تعذر الحذف", "error");
    }
  } catch (err) {
    showToast("تعذر الاتصال بالخادم", "error");
  }
}

async function printMemberDirect(id) {
  try {
    const res = await fetch(`/api/members/${id}`);
    const result = await res.json();
    if (result.success) {
      renderPrintableSheet(result.data);
      switchTab("tab-print-preview");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  } catch (err) {
    showToast("تعذر تجهيز الاستمارة للطباعة", "error");
  }
}

// ----------------- Printable Sheet Renderer (Exact Match to Image 2) -----------------
function renderPrintableSheet(m) {
  document.getElementById("print-full-name").textContent = m.full_name || "...........................................................................";
  document.getElementById("print-nickname").textContent = m.nickname || "...................................................";
  document.getElementById("print-national-id").textContent = m.national_id || "...........................................................................";
  document.getElementById("print-issued-by").textContent = m.id_issued_by || "........................";
  document.getElementById("print-issue-date").textContent = m.id_issue_date || "........................";
  document.getElementById("print-email").textContent = m.email || "...........................................................................";
  document.getElementById("print-birth-date").textContent = m.birth_date || "...................................................";
  document.getElementById("print-address").textContent = m.address || "...........................................................................";
  document.getElementById("print-governorate").textContent = m.governorate || "البحيرة";
  document.getElementById("print-electoral-district").textContent = m.electoral_district || "...........................................................................";
  document.getElementById("print-syndicate").textContent = m.syndicate || "...................................................";
  document.getElementById("print-qualification").textContent = m.qualification || "...........................................................................";
  document.getElementById("print-job-title").textContent = m.job_title || "...................................................";
  document.getElementById("print-workplace").textContent = m.workplace || "...........................................................................";
  document.getElementById("print-work-sector").textContent = m.work_sector || "...................................................";
  document.getElementById("print-phone").textContent = m.phone || "...........................................................................";
  document.getElementById("print-mobile").textContent = m.mobile || "...................................................";
  document.getElementById("print-public-positions").textContent = m.public_positions || "................................................................................................................................................";

  // Activities Table Checkmarks
  const allActs = ["شبابي", "ثقافي", "سياسي", "علمي", "مرأة", "جماهيري", "تنظيم", "إعلام", "علاقات عامة", "رياضي", "استراتيجي"];
  const userActs = Array.isArray(m.activities) ? m.activities : [];
  allActs.forEach(act => {
    const box = document.getElementById(`act-box-${act}`);
    if (box) {
      box.textContent = userActs.includes(act) ? "✔" : "";
    }
  });

  // Parties
  const parties = Array.isArray(m.previous_parties_details) ? m.previous_parties_details : ["", "", "", ""];
  document.getElementById("print-p1").textContent = parties[0] || "...................................................................................";
  document.getElementById("print-p2").textContent = parties[1] || "...................................................................................";
  document.getElementById("print-p3").textContent = parties[2] || "...................................................................................";
  document.getElementById("print-p4").textContent = parties[3] || "...................................................................................";

  // Elections
  document.getElementById("print-elections-other").textContent = m.elections_other_entity || "...............";
  const elDetails = m.elections_details || "";
  document.getElementById("print-election-details-line1").textContent = elDetails.substring(0, 80) || "................................................................................................................................................................................................";
  document.getElementById("print-election-details-line2").textContent = elDetails.substring(80) || "................................................................................................................................................................................................";

  // Endorser
  document.getElementById("print-endorser-name").textContent = m.endorser_name || "........................................................................";
  document.getElementById("print-endorser-title").textContent = m.endorser_title || "........................................................";

  // Applicant Name in Pledge
  document.getElementById("print-applicant-name").textContent = m.full_name || "..................................................";
  document.getElementById("print-officer-opinion").textContent = m.membership_officer_opinion || "..................................................";

  // Date
  if (m.created_at) {
    const d = new Date(m.created_at);
    document.getElementById("print-date-display").textContent = `${d.getDate()} / ${d.getMonth() + 1} / ${d.getFullYear()}`;
  }
}

// ----------------- Stats & Dashboard Analytics -----------------
async function fetchStats() {
  try {
    const res = await fetch("/api/stats");
    const result = await res.json();
    if (result.success) {
      const d = result.data;
      document.getElementById("stat-total-count").textContent = d.total || 0;
      document.getElementById("stat-approved-count").textContent = (d.status_counts["معتمد"] || 0) + (d.status_counts["مقبول"] || 0);
      document.getElementById("stat-pending-count").textContent = d.status_counts["قيد المراجعة"] || 0;
      document.getElementById("stat-beheira-count").textContent = d.governorates["البحيرة"] || 0;

      // Render activities breakdown
      const container = document.getElementById("activities-stats-container");
      container.innerHTML = "";
      const total = d.total || 1;

      const actKeys = ["شبابي", "تنظيم", "علاقات عامة", "مرأة", "ثقافي", "سياسي", "إعلام", "علمي", "رياضي", "استراتيجي", "جماهيري"];
      actKeys.forEach(act => {
        const count = d.activities[act] || 0;
        const pct = Math.round((count / total) * 100);

        const item = document.createElement("div");
        item.className = "stat-bar-item";
        item.innerHTML = `
          <div class="bar-header">
            <span>${escapeHtml(act)}</span>
            <span>${count} عضو (${pct}%)</span>
          </div>
          <div class="bar-progress-bg">
            <div class="bar-progress-fill" style="width: ${pct}%"></div>
          </div>
        `;
        container.appendChild(item);
      });
    }
  } catch (err) {
    console.error("Error fetching stats:", err);
  }
}

// ----------------- Toast Notification -----------------
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const msg = document.getElementById("toast-message");
  msg.textContent = message;
  
  toast.style.borderRightColor = type === "error" ? "var(--crimson-red)" : "var(--primary-gold)";
  toast.classList.remove("hidden");

  setTimeout(() => {
    toast.classList.add("hidden");
  }, 4000);
}

// =============================================================================
// AUTH & PERMISSIONS SYSTEM
// =============================================================================

function getToken() {
  return localStorage.getItem('haw_token') || sessionStorage.getItem('haw_token') || null;
}

function authHeaders() {
  const token = getToken();
  return token ? { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
               : { 'Content-Type': 'application/json' };
}

async function initAuth() {
  const token = getToken();
  if (!token) {
    window.location.href = 'login.html';
    return;
  }
  try {
    const res  = await fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    if (!data.success) {
      localStorage.removeItem('haw_token');
      sessionStorage.removeItem('haw_token');
      window.location.href = 'login.html';
      return;
    }
    currentUser = data.user;  // includes .permissions array
    renderHeaderUser();
  } catch (e) {
    window.location.href = 'login.html';
  }
}

function renderHeaderUser() {
  if (!currentUser) return;
  const roleLabels = {
    admin:    { label: 'مدير النظام',    cls: 'badge-admin' },
    editor:   { label: 'مسؤول التسجيل', cls: 'badge-editor' },
    reviewer: { label: 'مشرف ومراجع',   cls: 'badge-reviewer' },
    viewer:   { label: 'مستعرض فقط',    cls: 'badge-viewer' },
  };
  const info = roleLabels[currentUser.role] || { label: currentUser.role, cls: 'badge-viewer' };
  const wrap = document.getElementById('header-user-info');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="user-info-box">
      <span class="user-avatar">${escapeHtml(currentUser.full_name.charAt(0))}</span>
      <div class="user-details">
        <span class="user-name">${escapeHtml(currentUser.full_name)}</span>
        <span class="role-badge ${escapeHtml(info.cls)}">${escapeHtml(info.label)}</span>
      </div>
      <button class="btn-logout" onclick="doLogout()" title="تسجيل الخروج">⏻</button>
    </div>
  `;
}

async function doLogout() {
  const token = getToken();
  if (token) {
    await fetch('/api/auth/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } }).catch(() => {});
  }
  localStorage.removeItem('haw_token');
  localStorage.removeItem('haw_user');
  sessionStorage.removeItem('haw_token');
  sessionStorage.removeItem('haw_user');
  window.location.href = 'login.html';
}

// Check if current user has a specific permission
function canDo(action) {
  if (!currentUser) return false;
  const perms = currentUser.permissions || [];
  return perms.includes(action);
}

function applyPermissions() {
  if (!currentUser) return;

  // ---- Tab visibility ----
  const tabDatabase = document.getElementById('btn-tab-database');
  if (tabDatabase) {
    if (!canDo('view_members')) {
      tabDatabase.style.display = 'none';
      // If currently on that tab, switch to form
      if (document.getElementById('tab-database')?.classList.contains('active')) {
        switchTab('tab-form');
      }
    } else {
      tabDatabase.style.display = '';
    }
  }

  const tabStats = document.getElementById('btn-tab-stats');
  if (tabStats) {
    if (!canDo('view_stats')) {
      tabStats.style.display = 'none';
      if (document.getElementById('tab-stats')?.classList.contains('active')) {
        switchTab('tab-form');
      }
    } else {
      tabStats.style.display = '';
    }
  }

  // Users management tab: admin only (manage_users permission)
  const usersTab = document.getElementById('btn-tab-users');
  if (usersTab) usersTab.style.display = canDo('manage_users') ? '' : 'none';

  // New member button
  const btnNew = document.getElementById('btn-new-app');
  if (btnNew) btnNew.style.display = canDo('add_member') ? '' : 'none';

  // Export button
  const btnExport = document.getElementById('btn-export-header');
  if (btnExport) btnExport.style.display = canDo('export_data') ? '' : 'none';

  // Viewer: disable all form controls
  if (!canDo('add_member') && !canDo('edit_member')) {
    document.querySelectorAll('#tab-form input, #tab-form select, #tab-form textarea').forEach(el => {
      el.disabled = true;
    });
    const submitBtn = document.getElementById('btn-submit-form');
    if (submitBtn) submitBtn.style.display = 'none';
    const printBtn = document.querySelector('#tab-form .btn-secondary');
    if (printBtn) printBtn.style.display = 'none';
  }

  // Edit/Delete buttons in table rows
  document.querySelectorAll('.btn-danger').forEach(btn => {
    btn.style.display = canDo('delete_member') ? '' : 'none';
  });
  document.querySelectorAll('[onclick^="editMember"]').forEach(btn => {
    btn.style.display = canDo('edit_member') ? '' : 'none';
  });
}

// Override fetch calls to include auth token automatically
const _origFetch = window.fetch;
window.fetch = function(url, opts = {}) {
  const token = getToken();
  if (token && typeof url === 'string' && url.startsWith('/api/')) {
    opts.headers = Object.assign({}, opts.headers || {}, { 'Authorization': 'Bearer ' + token });
  }
  return _origFetch.call(this, url, opts);
};

// =============================================================================
// USERS MANAGEMENT (Admin only)
// =============================================================================

// All available permissions with Arabic labels
const ALL_PERMISSIONS = [
  { key: 'view_members',  label: 'عرض سجل الأعضاء والبيانات',     icon: '🗄️' },
  { key: 'view_stats',    label: 'عرض الإحصائيات والتقارير',       icon: '📊' },
  { key: 'add_member',    label: 'إضافة طلبات عضوية جديدة',       icon: '➕' },
  { key: 'edit_member',   label: 'تعديل بيانات الأعضاء',           icon: '✏️' },
  { key: 'delete_member', label: 'حذف الأعضاء من قاعدة البيانات', icon: '🗑️' },
  { key: 'approve_member',label: 'مراجعة واعتماد/رفض الطلبات',    icon: '✅' },
  { key: 'export_data',   label: 'تصدير البيانات إلى Excel',       icon: '📥' },
  { key: 'print_card',    label: 'طباعة الكارنيه والاستمارة',      icon: '🖨️' },
  { key: 'manage_users',  label: 'إدارة المستخدمين والصلاحيات',   icon: '👥' },
];

// Default permissions by role (mirrors server)
const ROLE_DEFAULTS = {
  admin:    ['view_members','view_stats','add_member','edit_member','delete_member','approve_member','export_data','print_card','manage_users'],
  editor:   ['view_members','view_stats','add_member','edit_member','export_data','print_card'],
  reviewer: ['view_members','view_stats','approve_member','export_data','print_card'],
  viewer:   [],
};

let usersData = [];

async function fetchUsers() {
  try {
    const res  = await fetch('/api/users');
    const data = await res.json();
    if (data.success) {
      usersData = data.data;
      renderUsersTable();
    }
  } catch (e) { console.error('fetchUsers error', e); }
}

function renderUsersTable() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  const roleMap = {
    admin:    ['مدير النظام',    'badge-admin'],
    editor:   ['مسؤول التسجيل', 'badge-editor'],
    reviewer: ['مشرف مراجع',    'badge-reviewer'],
    viewer:   ['مستعرض فقط',    'badge-viewer'],
  };

  tbody.innerHTML = usersData.map(u => {
    const [rlabel, rcls] = roleMap[u.role] || [u.role, 'badge-viewer'];
    const activeTxt = u.is_active
      ? '<span class="status-badge status-معتمد">نشط</span>'
      : '<span class="status-badge status-مرفوض">معطّل</span>';
    const customTag = u.has_custom_permissions
      ? '<span style="font-size:0.7rem;color:var(--primary-gold);margin-right:4px" title="صلاحيات مخصصة">⚙️</span>' : '';
    const perms = u.effective_permissions || [];
    const permSummary = ALL_PERMISSIONS
      .filter(p => perms.includes(p.key))
      .map(p => `<span title="${p.label}">${p.icon}</span>`)
      .join(' ');
    return `
      <tr>
        <td>${u.id}</td>
        <td><strong>${escapeHtml(u.full_name)}</strong>${customTag}<br><small style="color:var(--text-muted)">${escapeHtml(u.username)}</small></td>
        <td><span class="role-badge ${rcls}">${escapeHtml(rlabel)}</span></td>
        <td><div style="font-size:1rem;letter-spacing:2px">${permSummary || '<span style="color:var(--text-muted);font-size:0.8rem">لا صلاحيات</span>'}</div></td>
        <td>${activeTxt}</td>
        <td>
          <button class="tbl-action-btn" onclick="openEditUser(${u.id})" title="تعديل الصلاحيات">✏️</button>
          <button class="tbl-action-btn btn-danger" onclick="deleteUser(${parseInt(u.id)}, ${JSON.stringify(u.full_name)})" title="حذف">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderPermissionCheckboxes(selectedPerms, role) {
  const container = document.getElementById('user-modal-perms-grid');
  if (!container) return;
  container.innerHTML = ALL_PERMISSIONS.map(p => {
    const checked = selectedPerms.includes(p.key);
    const isAdminOnly = p.key === 'manage_users';
    return `
      <label class="perm-checkbox-item ${isAdminOnly ? 'perm-admin-only' : ''}">
        <input type="checkbox" name="perm" value="${p.key}" ${checked ? 'checked' : ''}>
        <span class="perm-icon">${p.icon}</span>
        <span class="perm-label">${p.label}</span>
      </label>
    `;
  }).join('');
}

function getCheckedPermissions() {
  return Array.from(document.querySelectorAll('#user-modal-perms-grid input[type=checkbox]:checked'))
    .map(cb => cb.value);
}

function openAddUser() {
  document.getElementById('user-modal-title').textContent = 'إضافة مستخدم جديد';
  document.getElementById('user-form').reset();
  document.getElementById('user-modal-id').value = '';
  document.getElementById('user-modal-pw-note').textContent = 'كلمة المرور مطلوبة';
  const role = document.getElementById('user-modal-role').value || 'viewer';
  renderPermissionCheckboxes(ROLE_DEFAULTS[role] || [], role);
  document.getElementById('user-modal').showModal();
}

function openEditUser(id) {
  const u = usersData.find(x => x.id === id);
  if (!u) return;
  document.getElementById('user-modal-title').textContent = 'تعديل بيانات المستخدم وصلاحياته';
  document.getElementById('user-modal-id').value       = u.id;
  document.getElementById('user-modal-fullname').value = u.full_name;
  document.getElementById('user-modal-username').value = u.username;
  document.getElementById('user-modal-role').value     = u.role;
  document.getElementById('user-modal-active').checked = u.is_active === 1;
  document.getElementById('user-modal-pw').value       = '';
  document.getElementById('user-modal-pw-note').textContent = 'اتركها فارغة للإبقاء على كلمة المرور الحالية';
  renderPermissionCheckboxes(u.effective_permissions || ROLE_DEFAULTS[u.role] || [], u.role);
  document.getElementById('user-modal').showModal();
}

// When role changes, reset checkboxes to role defaults
function onRoleChange() {
  const role = document.getElementById('user-modal-role').value;
  renderPermissionCheckboxes(ROLE_DEFAULTS[role] || [], role);
}

function closeUserModal() {
  document.getElementById('user-modal').close();
}

async function submitUserForm() {
  const id       = document.getElementById('user-modal-id').value;
  const fullName = document.getElementById('user-modal-fullname').value.trim();
  const username = document.getElementById('user-modal-username').value.trim();
  const role     = document.getElementById('user-modal-role').value;
  const isActive = document.getElementById('user-modal-active').checked;
  const password = document.getElementById('user-modal-pw').value.trim();
  const selectedPerms = getCheckedPermissions();

  if (!fullName || !username) {
    showToast('يرجى ملء جميع الحقول المطلوبة', 'error'); return;
  }
  if (!id && !password) {
    showToast('كلمة المرور مطلوبة لإضافة مستخدم جديد', 'error'); return;
  }

  const body = { full_name: fullName, username, role, is_active: isActive, permissions: selectedPerms };
  if (password) body.password = password;

  try {
    const url    = id ? `/api/users/${id}` : '/api/users';
    const method = id ? 'PUT' : 'POST';
    const res    = await fetch(url, { method, body: JSON.stringify(body) });
    const data   = await res.json();
    if (!data.success) { showToast(data.error || 'حدث خطأ', 'error'); return; }
    showToast(id ? 'تم تحديث بيانات المستخدم وصلاحياته بنجاح ✅' : 'تمت إضافة المستخدم بنجاح ✅');
    closeUserModal();
    fetchUsers();
  } catch (e) { showToast('حدث خطأ في الاتصال', 'error'); }
}

async function deleteUser(id, name) {
  if (!confirm(`هل أنت متأكد من حذف مستخدم: ${name}؟`)) return;
  try {
    const res  = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) { showToast(data.error || 'تعذّر الحذف', 'error'); return; }
    showToast('تم حذف المستخدم بنجاح');
    fetchUsers();
  } catch (e) { showToast('حدث خطأ في الاتصال', 'error'); }
}
