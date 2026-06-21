// ==================== НАСТРОЙКИ ====================

// Адрес API (тот же хост, что и страница)
const API_URL = `${window.location.origin}/api`;

// Данные пользователя из localStorage
let token = localStorage.getItem('token') || '';
let user = JSON.parse(localStorage.getItem('user') || 'null');
let ordersPollInterval = null;
let searchDebounceTimer = null;

// ==================== НАВИГАЦИЯ ====================

/**
 * Переключает видимую страницу
 * @param {string} pageName - название страницы: 'menu', 'cart', 'orders', 'login', 'register', 'admin', 'operator', 'courier'
 */
function showPage(pageName) {
    // 1. Скрываем все страницы
    document.querySelectorAll('.page').forEach(page => {
        page.classList.add('hidden');
    });
    
    // 2. Показываем нужную страницу
    const targetPage = document.getElementById(`page-${pageName}`);
    if (targetPage) {
        targetPage.classList.remove('hidden');
    }
    
    // 3. Обновляем активную кнопку в навигации (по id, не по event.target)
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Находим кнопку по id и делаем активной
    const activeBtn = document.getElementById(`nav-${pageName}`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    // 4. Показываем/скрываем кнопку "Назад"
    updateBackButton(pageName);
    
    // 5. Закрываем выпадающее меню
    closeDropdown();
    
    // 6. Загружаем данные для страницы
    if (pageName === 'menu') { loadCategories(); loadMenu(); }
    if (pageName === 'cart') { loadCart(); prefillOrderFields(); }
    if (pageName === 'orders') { loadOrders(); startOrdersPolling(); }
    else { stopOrdersPolling(); }
    if (pageName === 'admin') { loadDashboard(); loadAdminCategoriesSelect(); loadAdminMenu(); }
    if (pageName === 'operator') loadOperatorOrders();
    if (pageName === 'courier') { loadCourierDashboard(); loadCourierOrders(); }
}

/**
 * Показывает/скрывает выпадающее меню персонала
 */
function toggleDropdown() {
    const dropdown = document.querySelector('.dropdown');
    if (dropdown) {
        dropdown.classList.toggle('open');
    }
}

/**
 * Закрывает выпадающее меню персонала
 */
function closeDropdown() {
    const dropdown = document.querySelector('.dropdown');
    if (dropdown) {
        dropdown.classList.remove('open');
    }
}

/**
 * Закрывает меню при клике вне его
 */
document.addEventListener('click', function(e) {
    const dropdown = document.querySelector('.dropdown');
    if (dropdown && !dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
    }
});

/**
 * Обновляет кнопку "Назад" и заголовок страницы
 */
function updateBackButton(pageName) {
    const backBar = document.getElementById('back-bar');
    const titleEl = document.getElementById('current-page-title');
    
    // Страницы, где НЕ показываем "Назад"
    const mainPages = ['menu', 'login', 'register'];
    
    if (!backBar) return; // Если элемента нет — выходим
    
    if (mainPages.includes(pageName)) {
        backBar.classList.add('hidden');
    } else {
        backBar.classList.remove('hidden');
        const titles = {
            'cart': '🛒 Корзина',
            'orders': '📋 Мои заказы',
            'admin': '⚙️ Админ-панель',
            'operator': '👨‍🍳 Панель оператора',
            'courier': '🛵 Панель курьера'
        };
        if (titleEl) {
            titleEl.textContent = titles[pageName] || pageName;
        }
    }
}

/**
 * Возвращает на главную (или на панель для персонала)
 */
function goBack() {
    if (user && (user.role === 'operator' || user.role === 'courier')) {
        showPage(user.role);
    } else {
        showPage('menu');
    }
}

// ==================== API ЗАПРОСЫ ====================

/**
 * Универсальная функция для запросов к серверу
 * @param {string} url - путь API, например '/menu' или '/login'
 * @param {object} options - настройки запроса (метод, тело и т.д.)
 */
async function api(url, options = {}) {
    try {
        const response = await fetch(API_URL + url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
                ...options.headers
            }
        });
        
        let data;
        try {
            data = await response.json();
        } catch {
            data = {};
        }
        
        if (!response.ok) {
            throw new Error(data.error || 'Ошибка сервера');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

function debounceSearch() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(loadMenu, 400);
}

function prefillOrderFields() {
    const addressEl = document.getElementById('order-address');
    const phoneEl = document.getElementById('order-phone');
    if (user?.address && addressEl && !addressEl.value) {
        addressEl.value = user.address;
    }
    if (user?.phone && phoneEl && !phoneEl.value) {
        phoneEl.value = user.phone;
    }
}

function startOrdersPolling() {
    stopOrdersPolling();
    if (token && user?.role === 'client') {
        ordersPollInterval = setInterval(loadOrders, 15000);
    }
}

function stopOrdersPolling() {
    if (ordersPollInterval) {
        clearInterval(ordersPollInterval);
        ordersPollInterval = null;
    }
}


// ==================== КАТЕГОРИИ ====================

let currentCategory = ''; // Запоминаем выбранную категорию

/**
 * Загружает категории и показывает кнопки
 */
async function loadCategories() {
    try {
        const categories = await api('/categories');
        const container = document.getElementById('categories');
        
        // Кнопка "Все" — сброс фильтра
        let html = `<button class="category-btn ${currentCategory === '' ? 'active' : ''}" onclick="filterByCategory('')">Все</button>`;
        
        // Кнопки для каждой категории
        categories.forEach(cat => {
            html += `<button class="category-btn ${currentCategory == cat.id ? 'active' : ''}" onclick="filterByCategory(${cat.id})">${cat.name}</button>`;
        });
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Ошибка загрузки категорий:', error);
    }
}

/**
 * Фильтрует меню по категории
 */
function filterByCategory(categoryId) {
    currentCategory = categoryId;
    loadCategories(); // Обновляем активную кнопку
    loadMenu(); // Перезагружаем меню
}


// ==================== МЕНЮ ====================

/**
 * Загружает список блюд с сервера и отображает
 */
async function loadMenu() {
    try {
        const search = document.getElementById('search').value;
        
        // Загружаем категории
        // Пока категории загружаем вместе с блюдами, потом сделаем отдельно
        const categoryParam = currentCategory ? `&category=${currentCategory}` : '';
        const items = await api(`/menu?search=${encodeURIComponent(search)}${categoryParam}`);
        
        const container = document.getElementById('menu-items');
        
        if (items.length === 0) {
            container.innerHTML = '<div class="empty-message">Ничего не найдено</div>';
            return;
        }
        
        // Генерируем HTML для каждого блюда
        container.innerHTML = items.map(item => `
            <div class="dish-card ${item.is_available ? '' : 'unavailable'}">
                <img 
                    src="${item.image_url || `https://via.placeholder.com/300x200/ff6b6b/ffffff?text=${encodeURIComponent(item.name)}`}" 
                    alt="${item.name}"
                    class="dish-image"
                >
                <div class="dish-info">
                    <h3>${item.name}</h3>
                    <p>${item.description || 'Описание отсутствует'}</p>
                    <div class="dish-footer">
                        <span class="price">${item.price} ₽</span>
                        <button 
                            class="add-btn" 
                            onclick="addToCart(${item.id})"
                            ${item.is_available ? '' : 'disabled'}
                        >
                            ${item.is_available ? 'В корзину' : 'Недоступно'}
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        document.getElementById('menu-items').innerHTML = 
            '<div class="empty-message">Ошибка загрузки меню</div>';
    }
}

// ==================== КОРЗИНА ====================

/**
 * Добавляет блюдо в корзину
 */
async function addToCart(itemId) {
    if (!token) {
        showNotification('Сначала войдите в аккаунт!');
        showPage('login');
        return;
    }
    
    try {
        await api('/cart', {
            method: 'POST',
            body: JSON.stringify({ item_id: itemId, quantity: 1 })
        });
        
        showNotification('✅ Добавлено в корзину!');
        loadCart();
        
    } catch (error) {
        showNotification('Ошибка: ' + error.message, true);
    }
}

/**
 * Загружает содержимое корзины
 */
async function loadCart() {
    if (!token) {
        document.getElementById('cart-items').innerHTML = '';
        document.getElementById('cart-empty').style.display = 'block';
        document.getElementById('cart-total').textContent = 'Итого: 0 ₽';
        return;
    }
    
    try {
        const data = await api('/cart');
        const items = data.items || [];
        
        // Обновляем счётчик в навигации (суммарное количество, не позиций)
        const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);
        document.getElementById('cart-count').textContent = totalCount;
        
        const container = document.getElementById('cart-items');
        
        if (items.length === 0) {
            container.innerHTML = '';
            document.getElementById('cart-empty').style.display = 'block';
            document.getElementById('cart-total').textContent = 'Итого: 0 ₽';
            return;
        }
        
        document.getElementById('cart-empty').style.display = 'none';
        
        // Новый HTML с кнопками +/- и удаления
        container.innerHTML = items.map(item => `
            <div class="cart-item">
                <div class="cart-item-info">
                    <h4>${item.name}</h4>
                    <div class="cart-item-price">${item.price} ₽ за шт.</div>
                </div>
                
                <div class="cart-item-controls">
                    <button class="qty-btn" onclick="updateQuantity(${item.id}, ${item.quantity - 1})">−</button>
                    <span class="qty-value">${item.quantity}</span>
                    <button class="qty-btn" onclick="updateQuantity(${item.id}, ${item.quantity + 1})">+</button>
                </div>
                
                <div class="cart-item-total">${item.total} ₽</div>
                
                <button class="remove-btn" onclick="removeFromCart(${item.id})">🗑️</button>
            </div>
        `).join('');
        
        document.getElementById('cart-total').textContent = `Итого: ${data.total} ₽`;
        
    } catch (error) {
        console.error('Ошибка загрузки корзины:', error);
    }
}

/**
 * Изменяет количество товара в корзине
 */
async function updateQuantity(cartItemId, newQuantity) {
    if (newQuantity < 1) {
        // Если меньше 1 — удаляем
        removeFromCart(cartItemId);
        return;
    }
    
    try {
        await api(`/cart/${cartItemId}`, {
            method: 'PATCH',
            body: JSON.stringify({ quantity: newQuantity })
        });
        
        loadCart(); // Перезагружаем корзину
        
    } catch (error) {
        showNotification('Ошибка: ' + error.message, true);
    }
}

/**
 * Удаляет товар из корзины
 */
async function removeFromCart(cartItemId) {
    try {
        await api(`/cart/${cartItemId}`, {
            method: 'DELETE'
        });
        
        showNotification('🗑️ Удалено из корзины');
        loadCart(); // Перезагружаем корзину
        
    } catch (error) {
        showNotification('Ошибка: ' + error.message, true);
    }
}

// ==================== ЗАКАЗЫ ====================

/**
 * Оформляет заказ из корзины
 */
async function createOrder() {
    const address = document.getElementById('order-address').value.trim();
    const phone = document.getElementById('order-phone').value.trim();
    
    if (!address || !phone) {
        showNotification('Заполните адрес и телефон!', true);
        return;
    }
    
    try {
        const result = await api('/orders', {
            method: 'POST',
            body: JSON.stringify({ address, phone })
        });
        
        if (user && address !== user.address) {
            user.address = address;
            localStorage.setItem('user', JSON.stringify(user));
            api('/profile', { method: 'PATCH', body: JSON.stringify({ address }) }).catch(() => {});
        }
        
        showNotification(`Заказ №${result.orderId} оформлен! Сумма: ${result.total} ₽`);
        
        document.getElementById('order-address').value = '';
        document.getElementById('order-phone').value = '';
        
        loadCart();
        showPage('orders');
        
    } catch (error) {
        showNotification('Ошибка оформления: ' + error.message, true);
    }
}

/**
 * Загружает историю заказов пользователя
 */
async function loadOrders() {
    if (!token) {
        document.getElementById('orders-list').innerHTML = '';
        document.getElementById('orders-empty').style.display = 'block';
        return;
    }
    
    try {
        const orders = await api('/orders/my');
        
        const container = document.getElementById('orders-list');
        
        if (orders.length === 0) {
            container.innerHTML = '';
            document.getElementById('orders-empty').style.display = 'block';
            return;
        }
        
        document.getElementById('orders-empty').style.display = 'none';
        
        container.innerHTML = orders.map(order => `
            <div class="order-card" id="order-card-${order.id}">
                <div class="order-header">
                    <span class="order-number">Заказ №${order.id}</span>
                    <span class="status status-${order.status}">${translateStatus(order.status)}</span>
                </div>
                <div class="order-details">
                    <div>💰 Сумма: ${order.total_price} ₽</div>
                    <div>📍 ${order.address || 'Адрес не указан'}</div>
                    <div>📞 ${order.phone || 'Телефон не указан'}</div>
                    <div>🕐 ${formatDate(order.created_at)}</div>
                </div>
                <button class="btn btn-secondary order-details-btn" onclick="toggleOrderDetails(${order.id})">
                    📋 Состав заказа
                </button>
                <div class="order-items-list hidden" id="order-items-${order.id}"></div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Ошибка загрузки заказов:', error);
    }
}

async function toggleOrderDetails(orderId) {
    const container = document.getElementById(`order-items-${orderId}`);
    if (!container) return;
    
    if (!container.classList.contains('hidden')) {
        container.classList.add('hidden');
        return;
    }
    
    try {
        const order = await api(`/orders/${orderId}`);
        container.innerHTML = order.items.map(item => `
            <div class="order-item-row">
                <span>${item.name} × ${item.quantity}</span>
                <span>${item.price_at_moment * item.quantity} ₽</span>
            </div>
        `).join('');
        container.classList.remove('hidden');
    } catch (error) {
        showNotification('Не удалось загрузить состав: ' + error.message, true);
    }
}

// ==================== АВТОРИЗАЦИЯ ====================

/**
 * Вход в аккаунт
 */
async function login() {
    const phone = document.getElementById('login-phone').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!phone || !password) {
        showNotification('Введите телефон и пароль!', true);
        return;
    }
    
    try {
        const result = await api('/login', {
            method: 'POST',
            body: JSON.stringify({ phone, password })
        });
        
        // Сохраняем токен и данные пользователя
        token = result.token;
        user = result.user;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        
        // Обновляем интерфейс
        updateUI();
        
                // Перенаправляем на нужную страницу по роли
        if (user.role === 'operator') {
            showPage('operator');
        } else if (user.role === 'courier') {
            showPage('courier');
        } else {
            showPage('menu');
        }
        
        showNotification(`Добро пожаловать, ${user.name}!`);
        
    } catch (error) {
        showNotification('Ошибка входа: ' + error.message, true);
    }
}

/**
 * Регистрация нового пользователя
 */
async function register() {
    const name = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const address = document.getElementById('reg-address')?.value.trim() || '';
    const password = document.getElementById('reg-password').value;
    
    if (!name || !phone || !password) {
        showNotification('Заполните все поля!', true);
        return;
    }
    
    if (password.length < 6) {
        showNotification('Пароль должен быть минимум 6 символов!', true);
        return;
    }
    
    try {
        await api('/register', {
            method: 'POST',
            body: JSON.stringify({ name, phone, password, address })
        });
        
        showNotification('Регистрация успешна! Теперь войдите.');
        showPage('login');
        
        document.getElementById('reg-name').value = '';
        document.getElementById('reg-phone').value = '';
        document.getElementById('reg-password').value = '';
        const regAddress = document.getElementById('reg-address');
        if (regAddress) regAddress.value = '';
        
    } catch (error) {
        showNotification('Ошибка регистрации: ' + error.message, true);
    }
}

/**
 * Выход из аккаунта
 */
function logout() {
    token = '';
    user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    stopOrdersPolling();
    updateUI();
    showPage('menu');
    showNotification('Вы вышли из аккаунта');
}

// ==================== АДМИН-ПАНЕЛЬ ====================

/**
 * Загружает 3 цифры для админ-панели
 */
async function loadDashboard() {
    try {
        const data = await api('/dashboard');
        
        // Показываем числа с анимацией
        animateNumber('dash-orders', data.total_orders);
        animateNumber('dash-revenue', data.revenue, ' ₽');
        animateNumber('dash-menu', data.menu_items);
        
    } catch (error) {
        console.error('Ошибка загрузки dashboard:', error);
    }
}

/**
 * Анимирует число — плавно увеличивает от 0 до значения
 * @param {string} elementId — id элемента
 * @param {number} target — конечное число
 * @param {string} suffix — суффикс (например, ' ₽')
 */
function animateNumber(elementId, target, suffix = '') {
    const element = document.getElementById(elementId);
    const duration = 1000; // 1 секунда
    const start = 0;
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // easeOutQuad — плавное замедление в конце
        const ease = 1 - (1 - progress) * (1 - progress);
        const current = Math.floor(start + (target - start) * ease);
        
        element.textContent = current + suffix;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

// ==================== АДМИН: КАТЕГОРИИ И КАРТИНКИ ====================

let adminCategories = [];
let adminMenuCache = [];
let uploadedImageUrl = '';

/**
 * Переключает вкладки в админ-панели
 */
function showAdminTab(tabName, btn) {
    document.querySelectorAll('.admin-tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });
    
    document.getElementById(`admin-tab-${tabName}`).classList.remove('hidden');
    
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    
    if (tabName === 'categories') loadAdminCategories();
    if (tabName === 'staff') loadStaffList();
}

/**
 * Загружает категории в select админа
 */
async function loadAdminCategoriesSelect() {
    try {
        const categories = await api('/categories');
        adminCategories = categories;
        
        const select = document.getElementById('admin-category');
        select.innerHTML = categories.map(cat => 
            `<option value="${cat.id}">${cat.name}</option>`
        ).join('');
        
        const editSelect = document.getElementById('edit-dish-category');
        if (editSelect) {
            editSelect.innerHTML = categories.map(cat =>
                `<option value="${cat.id}">${cat.name}</option>`
            ).join('');
        }
        
    } catch (error) {
        console.error('Ошибка загрузки категорий:', error);
    }
}

/**
 * Предпросмотр картинки перед загрузкой
 */
function previewImage(input) {
    const preview = document.getElementById('image-preview');
    
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
            preview.classList.add('show');
        };
        
        reader.readAsDataURL(input.files[0]);
    }
}

/**
 * Загружает картинку на сервер
 */
async function uploadImage() {
    const input = document.getElementById('admin-image');
    
    if (!input.files || !input.files[0]) {
        return ''; // Картинка не выбрана
    }
    
    const file = input.files[0];
    const reader = new FileReader();
    
    return new Promise((resolve, reject) => {
        reader.onload = async function(e) {
            try {
                const result = await api('/upload', {
                    method: 'POST',
                    body: JSON.stringify({
                        image: e.target.result,
                        filename: file.name
                    })
                });
                
                uploadedImageUrl = result.url;
                resolve(result.url);
                
            } catch (error) {
                console.error('Ошибка загрузки картинки:', error);
                resolve('');
            }
        };
        
        reader.readAsDataURL(file);
    });
}

/**
 * Добавляет новое блюдо (с картинкой)
 */
async function addDish() {
    const name = document.getElementById('admin-name').value.trim();
    const description = document.getElementById('admin-desc').value.trim();
    const price = parseFloat(document.getElementById('admin-price').value);
    const category_id = parseInt(document.getElementById('admin-category').value);
    
    if (!name || !price) {
        showNotification('Название и цена обязательны!', true);
        return;
    }
    
    // Загружаем картинку если есть
    let imageUrl = '';
    const imageInput = document.getElementById('admin-image');
    if (imageInput.files && imageInput.files[0]) {
        imageUrl = await uploadImage();
    }
    
    try {
        await api('/menu', {
            method: 'POST',
            body: JSON.stringify({ 
                category_id, 
                name, 
                description, 
                price,
                image_url: imageUrl
            })
        });
        
        showNotification('✅ Блюдо добавлено!');
        
        // Очищаем поля
        document.getElementById('admin-name').value = '';
        document.getElementById('admin-desc').value = '';
        document.getElementById('admin-price').value = '';
        document.getElementById('admin-image').value = '';
        document.getElementById('image-preview').innerHTML = '';
        document.getElementById('image-preview').classList.remove('show');
        uploadedImageUrl = '';
        
        // Перезагружаем
        loadAdminMenu();
        loadMenu();
        
    } catch (error) {
        showNotification('Ошибка: ' + error.message, true);
    }
}

/**
 * Создаёт новую категорию
 */
async function addCategory() {
    const name = document.getElementById('new-category-name').value.trim();
    const sort_order = parseInt(document.getElementById('new-category-sort').value) || 0;
    
    if (!name) {
        showNotification('Введите название категории!', true);
        return;
    }
    
    try {
        await api('/categories', {
            method: 'POST',
            body: JSON.stringify({ name, sort_order })
        });
        
        showNotification('📁 Категория создана!');
        
        // Очищаем
        document.getElementById('new-category-name').value = '';
        document.getElementById('new-category-sort').value = '0';
        
        // Перезагружаем
        loadAdminCategories();
        loadCategories(); // В меню тоже
        
    } catch (error) {
        showNotification('Ошибка: ' + error.message, true);
    }
}

/**
 * Загружает список категорий для админа
 */
async function loadAdminCategories() {
    try {
        const categories = await api('/categories');
        const container = document.getElementById('admin-categories-list');
        
        if (categories.length === 0) {
            container.innerHTML = '<div class="empty-message">Нет категорий</div>';
            return;
        }
        
        container.innerHTML = categories.map(cat => `
            <div class="category-item">
                <div>
                    <div class="category-item-name">${cat.name}</div>
                    <div class="category-item-sort">Порядок: ${cat.sort_order}</div>
                </div>
                <button class="category-item-delete" onclick="deleteCategory(${cat.id})">🗑️ Удалить</button>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Ошибка загрузки категорий:', error);
    }
}

/**
 * Удаляет категорию
 */
async function deleteCategory(categoryId) {
    if (!confirm('Удалить категорию? Блюда в ней нужно будет перенести.')) return;
    
    try {
        await api(`/categories/${categoryId}`, {
            method: 'DELETE'
        });
        
        showNotification('🗑️ Категория удалена');
        loadAdminCategories();
        loadCategories();
        
    } catch (error) {
        showNotification('Ошибка: ' + error.message, true);
    }
}

/**
 * Загружает список блюд для админ-панели
 */
async function loadAdminMenu() {
    try {
        const items = await api('/menu/all');
        adminMenuCache = items;
        const container = document.getElementById('admin-menu-list');
        
        if (items.length === 0) {
            container.innerHTML = '<div class="empty-message">Нет блюд</div>';
        } else {
            container.innerHTML = items.map(item => `
                <div class="admin-item">
                    <div class="admin-item-info">
                        <h4>${item.name}</h4>
                        <div>${item.description || 'Без описания'}</div>
                        <div class="price">${item.price} ₽</div>
                        <div class="stock-status ${item.is_available ? 'in-stock' : 'out-of-stock'}">
                            ${item.is_available ? '✅ В наличии' : '❌ Нет в наличии'}
                        </div>
                    </div>
                    <div class="admin-item-controls">
                        <button class="admin-btn" onclick="openEditDish(${item.id})">✏️ Редактировать</button>
                        <button class="admin-btn admin-btn-toggle ${item.is_available ? '' : 'off'}" 
                                onclick="toggleDish(${item.id}, ${item.is_available ? 0 : 1})">
                            ${item.is_available ? 'Сделать недоступным' : 'Сделать доступным'}
                        </button>
                        <button class="admin-btn admin-btn-delete" onclick="deleteDish(${item.id})">
                            Удалить навсегда
                        </button>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        showNotification('Ошибка загрузки меню: ' + error.message, true);
    }
}

/**
 * Загружает список сотрудников
 */
async function loadStaffList() {
    try {
        const staff = await api('/staff');
        const container = document.getElementById('staff-list');
        
        if (staff.length === 0) {
            container.innerHTML = '<div class="empty-message">Нет сотрудников</div>';
            return;
        }
        
        container.innerHTML = staff.map(person => `
            <div class="staff-item">
                <div>
                    <div class="staff-name">${person.name}</div>
                    <div class="staff-role">${translateRole(person.role)} | Тел: ${person.phone}</div>
                </div>
                ${person.role !== 'admin' ? `
                    <button class="staff-delete-btn" onclick="deleteStaff(${person.id})">🗑️ Удалить</button>
                ` : '<span class="staff-admin">Админ</span>'}
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Ошибка загрузки сотрудников:', error);
    }
}

/**
 * Добавляет нового сотрудника
 */
async function addStaff() {
    const name = document.getElementById('staff-name').value.trim();
    const phone = document.getElementById('staff-phone').value.trim();
    const password = document.getElementById('staff-password').value;
    const role = document.getElementById('staff-role').value;
    
    if (!name || !phone || !password) {
        showNotification('Заполните все поля!', true);
        return;
    }
    
    if (password.length < 6) {
        showNotification('Пароль минимум 6 символов!', true);
        return;
    }
    
    try {
        await api('/staff', {
            method: 'POST',
            body: JSON.stringify({ name, phone, password, role })
        });
        
        showNotification('✅ Сотрудник добавлен!');
        
        // Очистить поля
        document.getElementById('staff-name').value = '';
        document.getElementById('staff-phone').value = '';
        document.getElementById('staff-password').value = '';
        
        // Перезагрузить список
        loadStaffList();
        
    } catch (error) {
        showNotification('Ошибка: ' + error.message, true);
    }
}

/**
 * Удаляет сотрудника
 */
async function deleteStaff(staffId) {
    if (!confirm('Удалить сотрудника?')) return;
    
    try {
        await api(`/staff/${staffId}`, {
            method: 'DELETE'
        });
        
        showNotification('🗑️ Сотрудник удалён');
        loadStaffList();
        
    } catch (error) {
        showNotification('Ошибка: ' + error.message, true);
    }
}


// ==================== ОПЕРАТОР ====================

let currentOrderFilter = 'all';

/**
 * Загружает заказы для оператора
 */
async function loadOperatorOrders() {
    try {
        const filterParam = currentOrderFilter !== 'all' ? `?status=${currentOrderFilter}` : '';
        const orders = await api(`/orders${filterParam}`);
        
        const container = document.getElementById('operator-orders-list');
        
        if (orders.length === 0) {
            container.innerHTML = '<div class="empty-message">Нет заказов</div>';
            return;
        }
        
        container.innerHTML = orders.map(order => `
            <div class="order-card operator-order">
                <div class="order-header">
                    <div>
                        <span class="order-number">Заказ №${order.id}</span>
                        <span class="status status-${order.status}">${translateStatus(order.status)}</span>
                    </div>
                    <span class="order-time">${formatDate(order.created_at)}</span>
                </div>
                
                <div class="order-client">
                    <div>👤 ${order.client_name || 'Неизвестно'}</div>
                    <div>📞 ${order.client_phone || 'Нет телефона'}</div>
                    <div>📍 ${order.address || 'Адрес не указан'}</div>
                </div>
                
                <div class="order-summary">
                    <div>💰 Сумма: <strong>${order.total_price} ₽</strong></div>
                </div>
                
                <div class="order-actions">
                    ${getNextStatusButton(order.id, order.status)}
                </div>
            </div>
        `).join('');

        // Загружаем курьеров для select'ов
        orders.forEach(order => {
            if (order.status === 'cooking') {
                loadCouriersForSelect(order.id);
            }
        });

    } catch (error) {
        document.getElementById('operator-orders-list').innerHTML = 
            '<div class="empty-message">Ошибка загрузки заказов</div>';
    }
}
function getNextStatusButton(orderId, currentStatus) {
    const nextStatuses = {
        'new': { next: 'cooking', label: '✅ Принять в работу' },
        'cooking': { next: 'on_the_way', label: '🛵 Назначить курьера', needCourier: true },
        'on_the_way': { next: null, label: '🚚 В пути (курьер доставляет)' },
        'delivered': { next: null, label: '✅ Завершено' },
        'cancelled': { next: null, label: '❌ Отменено' }
    };
    
    const status = nextStatuses[currentStatus];
    
    if (!status.next) {
        return `<span class="order-done">${status.label}</span>`;
    }
    
    // Если нужен курьер — показываем select с курьерами
    if (status.needCourier) {
        return `
            <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                <select id="courier-select-${orderId}" class="courier-select">
                    <option value="">Выберите курьера...</option>
                </select>
                <button class="btn btn-primary" onclick="assignCourierAndSend(${orderId})" style="width: auto;">
                    ${status.label}
                </button>
                <button class="btn btn-danger" onclick="cancelOrder(${orderId})" style="width: auto;">❌ Отменить</button>
            </div>
        `;
    }
    
    const cancelBtn = ['new', 'cooking'].includes(currentStatus)
        ? `<button class="btn btn-danger" onclick="cancelOrder(${orderId})" style="width: auto; margin-left: 8px;">❌ Отменить</button>`
        : '';
    
    return `<button class="btn btn-primary" onclick="updateOrderStatus(${orderId}, '${status.next}')">${status.label}</button>${cancelBtn}`;
}

async function cancelOrder(orderId) {
    if (!confirm('Отменить заказ №' + orderId + '?')) return;
    await updateOrderStatus(orderId, 'cancelled');
}

/**
 * Фильтрует заказы по статусу
 */
function filterOrders(status) {
    currentOrderFilter = status;
    
    // Обновляем активную кнопку
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    loadOperatorOrders();
}

/**
 * Обновляет статус заказа
 */
async function updateOrderStatus(orderId, newStatus) {
    try {
        await api(`/orders/${orderId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: newStatus })
        });
        
        showNotification(`Статус изменён на "${translateStatus(newStatus)}"`);
        loadOperatorOrders();
        
    } catch (error) {
        showNotification('Ошибка: ' + error.message, true);
    }
}

/**
 * Открывает форму редактирования блюда
 */
function openEditDish(itemId) {
    const item = adminMenuCache.find(i => i.id === itemId);
    if (!item) return;
    editDish(item);
}

function editDish(item) {
    document.getElementById('edit-dish-id').value = item.id;
    document.getElementById('edit-dish-name').value = item.name;
    document.getElementById('edit-dish-desc').value = item.description || '';
    document.getElementById('edit-dish-price').value = item.price;
    document.getElementById('edit-dish-category').value = item.category_id;
    document.getElementById('edit-dish-modal').classList.remove('hidden');
}

function closeEditDishModal() {
    document.getElementById('edit-dish-modal').classList.add('hidden');
}

async function saveDishEdit() {
    const id = document.getElementById('edit-dish-id').value;
    const name = document.getElementById('edit-dish-name').value.trim();
    const description = document.getElementById('edit-dish-desc').value.trim();
    const price = parseFloat(document.getElementById('edit-dish-price').value);
    const category_id = parseInt(document.getElementById('edit-dish-category').value);
    
    if (!name || !price) {
        showNotification('Название и цена обязательны!', true);
        return;
    }
    
    try {
        await api(`/menu/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ category_id, name, description, price })
        });
        
        showNotification('✅ Блюдо обновлено!');
        closeEditDishModal();
        loadAdminMenu();
        loadMenu();
    } catch (error) {
        showNotification('Ошибка: ' + error.message, true);
    }
}

/**
 * Включает/выключает блюдо (доступность для клиентов)
 */
async function toggleDish(itemId, isAvailable) {
    try {
        await api(`/menu/${itemId}/availability`, {
            method: 'PATCH',
            body: JSON.stringify({ is_available: isAvailable })
        });
        
        showNotification(isAvailable ? '✅ Блюдо теперь доступно клиентам' : '❌ Блюдо теперь недоступно клиентам');
        loadAdminMenu();
        loadMenu();
        
    } catch (error) {
        showNotification('Ошибка: ' + error.message, true);
    }
}

/**
 * Удаляет блюдо НАВСЕГДА
 */
async function deleteDish(itemId) {
    if (!confirm('⚠️ ВНИМАНИЕ!\n\nЭто удалит блюдо НАВСЕГДА!\nКлиенты больше не увидят его.\n\nТочно удалить?')) return;
    
    try {
        await api(`/menu/${itemId}`, {
            method: 'DELETE'
        });
        
        showNotification('🗑️ Блюдо удалено навсегда');
        loadAdminMenu();
        loadMenu();
        
    } catch (error) {
        showNotification('Ошибка: ' + error.message, true);
    }
}

// ==================== ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ====================

/**
 * Обновляет элементы интерфейса в зависимости от состояния авторизации
 */

function updateUI() {
    const userInfo = document.getElementById('user-info');
    const loginBtn = document.getElementById('login-btn');
    const navLogin = document.getElementById('nav-login');
    
    if (user) {
        // Обновляем шапку
        userInfo.textContent = `Привет, ${user.name}! (${translateRole(user.role)})`;
        
        // Обновляем кнопку входа/выхода
        if (navLogin) {
            navLogin.innerHTML = '<span class="nav-icon">🚪</span> Выйти';
            navLogin.onclick = logout;
        }
        
        // Показываем/скрываем меню по ролям
        updateRoleMenu();
        
    } else {
        // Не авторизован
        userInfo.textContent = 'Войдите, чтобы заказать';
        
        if (navLogin) {
            navLogin.innerHTML = '<span class="nav-icon">🔑</span> Войти';
            navLogin.onclick = () => showPage('login');
        }
        
        // Скрываем всё персональное меню
        const staffMenu = document.getElementById('staff-menu');
        if (staffMenu) staffMenu.classList.add('hidden');
    }
}

/**
 * Показывает/скрывает пункты меню по роли пользователя
 */
function updateRoleMenu() {
    const staffMenu = document.getElementById('staff-menu');
    const navMenu = document.getElementById('nav-menu');
    const navCart = document.getElementById('nav-cart');
    const navOrders = document.getElementById('nav-orders');
    const navOperator = document.getElementById('nav-operator');
    const navCourier = document.getElementById('nav-courier');
    const navAdmin = document.getElementById('nav-admin');
    
    // Скрываем всё по умолчанию
    if (staffMenu) staffMenu.classList.add('hidden');
    if (navOperator) navOperator.classList.add('hidden');
    if (navCourier) navCourier.classList.add('hidden');
    if (navAdmin) navAdmin.classList.add('hidden');
    
    if (!user) return;
    
    // Показываем клиентское меню (клиент и админ)
    // Скрываем у оператора и курьера
    if (user.role === 'operator' || user.role === 'courier') {
        if (navMenu) navMenu.classList.add('hidden');
        if (navCart) navCart.classList.add('hidden');
        if (navOrders) navOrders.classList.add('hidden');
    } else {
        if (navMenu) navMenu.classList.remove('hidden');
        if (navCart) navCart.classList.remove('hidden');
        if (navOrders) navOrders.classList.remove('hidden');
    }
    
    // Показываем меню персонала если есть роль
    if (['operator', 'courier', 'admin'].includes(user.role)) {
        if (staffMenu) staffMenu.classList.remove('hidden');
    }
    
    // Показываем нужные пункты в выпадающем меню
    if (user.role === 'operator' || user.role === 'admin') {
        if (navOperator) navOperator.classList.remove('hidden');
    }
    if (user.role === 'courier') {
        if (navCourier) navCourier.classList.remove('hidden');
    }
    if (user.role === 'admin') {
        if (navAdmin) navAdmin.classList.remove('hidden');
    }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

/**
 * Переводит статус заказа на русский
 */
function translateStatus(status) {
    const statuses = {
        'new': 'Новый',
        'cooking': 'Готовится',
        'on_the_way': 'В пути',
        'delivered': 'Доставлен',
        'cancelled': 'Отменён'
    };
    return statuses[status] || status;
}

function translateRole(role) {
    const roles = {
        'client': 'Клиент',
        'operator': 'Оператор',
        'courier': 'Курьер',
        'admin': 'Администратор'
    };
    return roles[role] || role;
}

/**
 * Форматирует дату в читаемый вид
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Показывает всплывающее уведомление
 */
function showNotification(message, isError = false) {
    const notif = document.createElement('div');
    notif.textContent = message;
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${isError ? '#e74c3c' : '#4ecdc4'};
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        z-index: 1000;
        animation: fadeIn 0.3s ease;
    `;
    
    document.body.appendChild(notif);
    
    // Удаляем через 3 секунды
    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transition = 'opacity 0.5s';
        setTimeout(() => notif.remove(), 500);
    }, 3000);
}

/**
 * Загружает список курьеров в select
 */
async function loadCouriersForSelect(orderId) {
    try {
        const couriers = await api('/couriers');
        const select = document.getElementById(`courier-select-${orderId}`);
        
        if (!select) return;
        
        couriers.forEach(courier => {
            const option = document.createElement('option');
            option.value = courier.id;
            option.textContent = `${courier.name} (тел: ${courier.phone})`;
            select.appendChild(option);
        });
        
    } catch (error) {
        console.error('Ошибка загрузки курьеров:', error);
    }
}

/**
 * Оператор назначает курьера и меняет статус
 */
async function assignCourierAndSend(orderId) {
    const select = document.getElementById(`courier-select-${orderId}`);
    const courierId = select ? select.value : '';
    
    if (!courierId) {
        showNotification('Выберите курьера!', true);
        return;
    }
    
    try {
        await api(`/orders/${orderId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'on_the_way', courier_id: parseInt(courierId) })
        });
        
        showNotification('🛵 Курьер назначен! Заказ в пути.');
        loadOperatorOrders();
        
    } catch (error) {
        showNotification('Ошибка: ' + error.message, true);
    }
}

// ==================== КУРЬЕР ====================

/**
 * Загружает сводку курьера (Dashboard)
 */
async function loadCourierDashboard() {
    try {
        const data = await api('/courier/stats');
        
        document.getElementById('courier-earned').textContent = data.total_earned + ' ₽';
        document.getElementById('courier-delivered').textContent = data.total_delivered;
        document.getElementById('courier-onway').textContent = data.on_the_way;
        
    } catch (error) {
        console.error('Ошибка загрузки сводки курьера:', error);
    }
}

/**
 * Загружает активные заказы и историю курьера
 */
async function loadCourierOrders() {
    try {
        // Активные заказы (в пути)
        const activeOrders = await api('/courier/orders');
        const activeContainer = document.getElementById('courier-active-orders');
        const noActive = document.getElementById('courier-no-active');
        
        if (activeOrders.length === 0) {
            activeContainer.innerHTML = '';
            noActive.style.display = 'block';
        } else {
            noActive.style.display = 'none';
            
            activeContainer.innerHTML = activeOrders.map(order => {
                // Считаем наценку курьера
                const percent = order.total_price < 1000 ? 25 : 15;
                const earnings = Math.round(order.total_price * percent / 100);
                
                return `
                    <div class="courier-order-card">
                        <div class="courier-order-header">
                            <span class="courier-order-number">Заказ №${order.id}</span>
                            <span class="courier-order-status">🚚 В пути</span>
                        </div>
                        
                        <div class="courier-order-details">
                            <div class="courier-detail">
                                <div class="courier-detail-label">📍 Адрес</div>
                                <div class="courier-detail-value">${order.address || 'Не указан'}</div>
                            </div>
                            <div class="courier-detail">
                                <div class="courier-detail-label">📞 Телефон</div>
                                <div class="courier-detail-value">${order.phone || 'Не указан'}</div>
                            </div>
                            <div class="courier-detail">
                                <div class="courier-detail-label">👤 Клиент</div>
                                <div class="courier-detail-value">${order.client_name || 'Неизвестно'}</div>
                            </div>
                            <div class="courier-detail">
                                <div class="courier-detail-label">💰 Сумма заказа</div>
                                <div class="courier-detail-value">${order.total_price} ₽</div>
                            </div>
                        </div>
                        
                        <div class="courier-earnings">
                            <div class="courier-earnings-label">💵 Твоя наценка (${percent}%)</div>
                            <div class="courier-earnings-value">+${earnings} ₽</div>
                        </div>
                        
                        <button class="deliver-btn" onclick="deliverOrder(${order.id})">
                            ✅ Заказ доставлен
                        </button>
                    </div>
                `;
            }).join('');
        }
        
        // История доставок
        const history = await api('/courier/history');
        const historyContainer = document.getElementById('courier-history');
        const noHistory = document.getElementById('courier-no-history');
        
        // Фильтруем только доставленные
        const delivered = history.filter(o => o.status === 'delivered');
        
        if (delivered.length === 0) {
            historyContainer.innerHTML = '';
            noHistory.style.display = 'block';
        } else {
            noHistory.style.display = 'none';
            
            historyContainer.innerHTML = delivered.map(order => `
                <div class="order-card">
                    <div class="order-header">
                        <span class="order-number">Заказ №${order.id}</span>
                        <span class="status status-delivered">Доставлен</span>
                    </div>
                    <div class="order-details">
                        <div>📍 ${order.address || 'Адрес не указан'}</div>
                        <div>💰 ${order.total_price} ₽</div>
                        <div>🕐 ${formatDate(order.created_at)}</div>
                    </div>
                </div>
            `).join('');
        }
        
    } catch (error) {
        console.error('Ошибка загрузки заказов курьера:', error);
    }
}

/**
 * Курьер отмечает заказ доставленным
 */
async function deliverOrder(orderId) {
    if (!confirm('Подтвердить доставку заказа №' + orderId + '?')) return;
    
    try {
        await api(`/courier/orders/${orderId}/deliver`, {
            method: 'PATCH'
        });
        
        showNotification('✅ Заказ доставлен!');
        
        // Перезагружаем всё
        loadCourierDashboard();
        loadCourierOrders();
        
    } catch (error) {
        showNotification('Ошибка: ' + error.message, true);
    }
}

/**
 * Показывает уведомление курьеру (когда заказ готовится)
 */
function showCourierNotification(orderInfo) {
    const notifBlock = document.getElementById('courier-notifications');
    const notifText = document.getElementById('courier-notif-text');
    
    notifText.textContent = `Заказ №${orderInfo.id} скоро будет готов! Адрес: ${orderInfo.address}`;
    notifBlock.classList.remove('hidden');
}

/**
 * Скрывает уведомление курьера
 */
function hideCourierNotification() {
    document.getElementById('courier-notifications').classList.add('hidden');
}

// ==================== ЗАПУСК ====================

// При загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    updateUI();
    loadCategories(); // Загружаем категории
    loadMenu(); // Загружаем меню
});
