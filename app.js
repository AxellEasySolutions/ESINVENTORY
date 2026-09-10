// CONFIGURACIÓN DE SUPABASE
const SUPABASE_URL = 'https://yuppkdlmjgneyzpuwupq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1cHBrZGxtamduZXl6cHV3dXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NTgyNzYsImV4cCI6MjEwNDQzNDI3Nn0.oJY0jks32BYBttOm5FYgBhAn-cIw5F6qDaXFh10No78';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let cestaMateriales = [];
let listaRequestTemp = [];
let usuarioActual = null;
let productoEditandoId = null;

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  const sesionGuardada = localStorage.getItem('sesion_usuario');
  if (sesionGuardada) {
    usuarioActual = JSON.parse(sesionGuardada);
    iniciarInterfaz();
  }

  document.getElementById('login-form').addEventListener('submit', iniciarSesion);
  document.getElementById('product-form').addEventListener('submit', guardarProducto);
  document.getElementById('movement-form').addEventListener('submit', registrarMovimiento);
  
  const purchaseForm = document.getElementById('purchase-form');
  if (purchaseForm) purchaseForm.addEventListener('submit', registrarCompra);

  const dispatchForm = document.getElementById('dispatch-form');
  if (dispatchForm) dispatchForm.addEventListener('submit', registrarSalidaModule);

  const obraForm = document.getElementById('obra-form');
  if (obraForm) obraForm.addEventListener('submit', registrarObra);

  const contractorForm = document.getElementById('contractor-form');
  if (contractorForm) contractorForm.addEventListener('submit', registrarContratista);

  const providerForm = document.getElementById('provider-form');
  if (providerForm) providerForm.addEventListener('submit', registrarProveedor);
});

// ==========================================
// 1. AUTENTICACIÓN Y CONTROL DE ROLES
// ==========================================
async function iniciarSesion(e) {
  e.preventDefault();

  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value.trim();

  const { data: usuario, error } = await _supabase
    .from('usuarios')
    .select('*')
    .ilike('email', email)
    .eq('password', password)
    .maybeSingle();

  if (error) {
    console.error('Error al consultar usuarios en Supabase:', error);
    return alert('Error de conexión con la base de datos: ' + error.message);
  }

  if (!usuario) {
    return alert('Credenciales incorrectas. Verifique que el correo y la contraseña coincidan exactamente.');
  }

  usuarioActual = usuario;
  localStorage.setItem('sesion_usuario', JSON.stringify(usuario));
  iniciarInterfaz();
}

function cerrarSesion() {
  localStorage.removeItem('sesion_usuario');
  usuarioActual = null;
  document.getElementById('login-screen').style.display = 'grid';
  document.getElementById('login-form').reset();
}

function iniciarInterfaz() {
  document.getElementById('login-screen').style.display = 'none';
  
  const badge = document.getElementById('user-badge');
  if (badge) badge.innerText = `${usuarioActual.nombre} (${usuarioActual.rol === 'ADMIN' ? 'Admin' : 'Gerente Obra'})`;

  const elName = document.getElementById('dropdown-user-name');
  const elRole = document.getElementById('dropdown-user-role');
  if (elName) elName.innerText = usuarioActual.nombre;
  if (elRole) elRole.innerText = usuarioActual.rol === 'ADMIN' ? 'Administrador' : 'Gerente de Obra';

  aplicarPermisosRol();
  cargarDatos();
  suscribirPresenciaEnVivo();
  escucharNotificacionesRequests();
}

function aplicarPermisosRol() {
  const esAdmin = usuarioActual.rol === 'ADMIN';

  document.querySelectorAll('[data-role="ADMIN"]').forEach(el => {
    el.style.display = esAdmin ? '' : 'none';
  });

  const btnNuevoProd = document.getElementById('btn-nuevo-prod-header');
  if (btnNuevoProd) btnNuevoProd.style.display = esAdmin ? 'flex' : 'none';
}

// ==========================================
// GESTIÓN DE PERFIL, MENÚ Y CONTRASEÑA
// ==========================================
function toggleUserDropdown() {
  const menu = document.getElementById('user-dropdown-menu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

document.addEventListener('click', (e) => {
  const btn = document.getElementById('user-menu-btn');
  const menu = document.getElementById('user-dropdown-menu');
  if (btn && menu && !btn.contains(e.target) && !menu.contains(e.target)) {
    menu.style.display = 'none';
  }
});

function openChangePasswordModal() {
  const menu = document.getElementById('user-dropdown-menu');
  if (menu) menu.style.display = 'none';
  const modal = document.getElementById('modal-change-password');
  if (modal) modal.classList.add('open');
}

function closeChangePasswordModal() {
  const modal = document.getElementById('modal-change-password');
  if (modal) modal.classList.remove('open');
  const form = document.getElementById('change-password-form');
  if (form) form.reset();
}

async function guardarNuevaContrasena(e) {
  e.preventDefault();

  if (!usuarioActual) return alert('No hay una sesión activa.');

  const passActual = document.getElementById('pass-actual').value.trim();
  const passNueva = document.getElementById('pass-nueva').value.trim();
  const passConfirmar = document.getElementById('pass-confirmar').value.trim();

  if (passActual !== usuarioActual.password) {
    return alert('La contraseña actual ingresada es incorrecta.');
  }

  if (passNueva.length < 6) {
    return alert('La nueva contraseña debe tener al menos 6 caracteres.');
  }

  if (passNueva !== passConfirmar) {
    return alert('La nueva contraseña y su confirmación no coinciden.');
  }

  const { error } = await _supabase
    .from('usuarios')
    .update({ password: passNueva })
    .eq('id', usuarioActual.id);

  if (error) {
    return alert('Error al actualizar la contraseña: ' + error.message);
  }

  usuarioActual.password = passNueva;
  localStorage.setItem('sesion_usuario', JSON.stringify(usuarioActual));

  alert('¡Contraseña actualizada con éxito!');
  closeChangePasswordModal();
}

// ==========================================
// PRESENCIA EN TIEMPO REAL (USUARIOS ACTIVOS)
// ==========================================
function suscribirPresenciaEnVivo() {
  if (!usuarioActual) return;

  const channel = _supabase.channel('online-users', {
    config: {
      presence: { key: usuarioActual.email },
    },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      renderizarUsuariosConectados(state);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          nombre: usuarioActual.nombre,
          email: usuarioActual.email,
          inicial: usuarioActual.nombre ? usuarioActual.nombre.charAt(0).toUpperCase() : 'U'
        });
      }
    });
}

function renderizarUsuariosConectados(state) {
  const container = document.getElementById('online-users-container');
  if (!container) return;

  const usuarios = [];
  Object.values(state).forEach(presences => {
    presences.forEach(p => usuarios.push(p));
  });

  const colores = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

  container.innerHTML = usuarios.map((u, idx) => {
    const colorBg = colores[idx % colores.length];
    return `
      <div title="${u.nombre} (${u.email})" style="
        width: 32px; 
        height: 32px; 
        border-radius: 50%; 
        background: ${colorBg}; 
        color: white; 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        font-size: 0.85rem; 
        font-weight: 700; 
        border: 2px solid #fff;
        margin-left: -8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.15);
        cursor: pointer;
        transition: transform 0.2s;
      " onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'">
        ${u.inicial}
      </div>
    `;
  }).join('');
}

// ==========================================
// NOTIFICACIONES FLOTANTES PERSISTENTES (TOAST)
// ==========================================
function escucharNotificacionesRequests() {
  _supabase
    .channel('requests-realtime')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'requests'
      },
      (payload) => {
        const nuevoReq = payload.new;
        
        cargarHistorialRequests();

        if (nuevoReq && usuarioActual && nuevoReq.created_by !== usuarioActual.nombre) {
          mostrarNotificacionFlotante(nuevoReq);
        }
      }
    )
    .subscribe();
}

function mostrarNotificacionFlotante(req) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toastId = `toast-${Date.now()}`;
  const toast = document.createElement('div');
  toast.id = toastId;
  toast.style.cssText = `
    background: #ffffff;
    border-left: 5px solid var(--header-green);
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.25);
    padding: 12px 16px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    color: var(--text-dark);
    font-family: inherit;
    animation: slideInRight 0.3s ease;
  `;

  toast.innerHTML = `
    <div style="background: #dcfce7; color: #16a34a; padding: 8px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
      <i data-lucide="bell" style="width: 18px; height: 18px;"></i>
    </div>
    <div style="flex-grow: 1;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <strong style="font-size: 0.85rem; color: var(--text-dark);">¡Nuevo Request Recibido!</strong>
        <span style="font-size: 0.7rem; color: var(--text-muted);">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
      </div>
      <p style="font-size: 0.78rem; margin: 0; color: var(--text-muted); line-height: 1.3;">
        <b>${req.created_by || 'WFH'}</b> ha enviado una solicitud para la obra <b>${req.obra_destino}</b>.
      </p>
      <button onclick="irARequests('${toastId}')" style="background: none; border: none; color: var(--primary-blue); font-size: 0.75rem; font-weight: 700; padding: 0; margin-top: 6px; cursor: pointer; text-decoration: underline;">
        Ver en tabla de Requests
      </button>
    </div>
    <button onclick="cerrarToast('${toastId}')" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 1.1rem; font-weight: 700; padding: 0; line-height: 1;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#94a3b8'">
      &times;
    </button>
  `;

  container.appendChild(toast);
  lucide.createIcons();
}

function cerrarToast(id) {
  const toast = document.getElementById(id);
  if (toast) {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }
}

function irARequests(toastId) {
  switchTab('etiquetas');
  cerrarToast(toastId);
}

// ==========================================
// 2. CARGA GENERAL DE DATOS
// ==========================================
async function cargarDatos() {
  const { data: productos, error: errProd } = await _supabase.from('productos').select('*');
  if (errProd) console.error('Error cargando productos:', errProd);

  const { data: movimientos, error: errMov } = await _supabase
    .from('movimientos')
    .select('*, productos(nombre, costo_unitario)')
    .order('fecha', { ascending: false });
  if (errMov) console.error('Error cargando movimientos:', errMov);

  const { data: obras, error: errObras } = await _supabase.from('obras').select('*');
  if (errObras) console.error('Error cargando obras:', errObras);

  const { data: contratistas, error: errCnt } = await _supabase.from('contratistas').select('*');
  if (errCnt) console.error('Error cargando contratistas:', errCnt);

  const { data: proveedores, error: errProv } = await _supabase.from('proveedores').select('*');
  if (errProv) console.error('Error cargando proveedores:', errProv);

  renderizarDashboard(productos || [], movimientos || [], obras || []);
  renderizarTablaInventario(productos || []);
  renderizarMovimientos(movimientos || []);
  cargarHistorialCompras();
  cargarHistorialSalidas();
  cargarHistorialRequests();
  
  poblarSelectProductos(productos || []);
  poblarSelectObras(obras || []);
  poblarSelectContratistas(contratistas || []);
  poblarSelectProveedores(proveedores || []);

  renderizarTablaObras(obras || []);
  cargarContratistas(contratistas || []);
  renderizarTablaProveedores(proveedores || []);
}

// ==========================================
// 3. DASHBOARD Y KPIs
// ==========================================
function renderizarDashboard(productos, movimientos, obras) {
  document.getElementById('kpi-materiales').innerText = productos.length;

  const totalValor = productos.reduce((sum, p) => sum + (p.stock_actual * p.costo_unitario), 0);
  document.getElementById('kpi-valor').innerText = `$${totalValor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const criticos = productos.filter(p => p.stock_actual <= p.stock_minimo && p.stock_actual > 0);
  document.getElementById('kpi-critico').innerText = criticos.length;

  const agotados = productos.filter(p => p.stock_actual === 0);
  document.getElementById('kpi-agotados').innerText = agotados.length;

  const obrasActivas = obras.filter(o => !o.estado || o.estado.toLowerCase() === 'activa');
  const kpiObras = document.getElementById('kpi-obras-count');
  if (kpiObras) kpiObras.innerText = obrasActivas.length;

  const dashWorksContainer = document.getElementById('dash-works');
  if (dashWorksContainer) {
    if (obrasActivas.length === 0) {
      dashWorksContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem;">Sin obras activas registradas.</p>';
    } else {
      dashWorksContainer.innerHTML = obrasActivas.slice(0, 5).map(o => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 0.5rem 0; border-bottom:1px solid var(--sidebar-border)">
          <div>
            <strong style="font-size:0.85rem; color:var(--text-dark);">${o.direccion || o.nombre}</strong>
            <div style="font-size:0.72rem; color:var(--text-muted);">${o.subdivision && o.subdivision !== 'N/A' ? o.subdivision : ''} ${o.county && o.county !== 'N/A' ? '• ' + o.county : ''}</div>
          </div>
          <div>
            <span class="badge badge-in">${o.estado || 'Activa'}</span>
          </div>
        </div>
      `).join('');
    }
  }

  const ahora = new Date();
  const mesActual = ahora.getMonth();
  const anioActual = ahora.getFullYear();

  let totalEntradas = 0;
  let totalSalidas = 0;

  movimientos.forEach(m => {
    const fechaMov = new Date(m.fecha);
    if (fechaMov.getMonth() === mesActual && fechaMov.getFullYear() === anioActual) {
      const costo = m.productos?.costo_unitario || 0;
      const subtotal = m.cantidad * costo;

      if (m.tipo === 'ENTRADA') totalEntradas += subtotal;
      if (m.tipo === 'SALIDA') totalSalidas += subtotal;
    }
  });

  document.getElementById('kpi-entradas').innerText = `$${totalEntradas.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  document.getElementById('kpi-salidas').innerText = `$${totalSalidas.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const categoriasMap = {};
  productos.forEach(p => {
    categoriasMap[p.categoria] = (categoriasMap[p.categoria] || 0) + p.stock_actual;
  });

  const numCategorias = Object.keys(categoriasMap).length;
  document.getElementById('kpi-cat-count').innerText = `${numCategorias} categorías`;

  const dashCatContainer = document.getElementById('dash-categories');
  const maxStock = Math.max(...Object.values(categoriasMap), 1);

  if (numCategorias === 0) {
    dashCatContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem;">No hay categorías registradas.</p>';
  } else {
    dashCatContainer.innerHTML = Object.entries(categoriasMap).map(([cat, cant]) => {
      const pct = Math.min((cant / maxStock) * 100, 100);
      return `
        <div class="cat-row">
          <div class="cat-labels">
            <strong>${cat}</strong>
            <span style="color: var(--text-muted);">${cant} unidades</span>
          </div>
          <div class="cat-bar-bg">
            <div class="cat-bar-fill" style="width: ${pct}%;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  const todasAlertas = productos.filter(p => p.stock_actual <= p.stock_minimo);
  document.getElementById('dash-alert-count').innerText = todasAlertas.length;

  const alertContainer = document.getElementById('dash-alerts');
  if (todasAlertas.length === 0) {
    alertContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem;">Sin alertas de reposición.</p>';
  } else {
    alertContainer.innerHTML = todasAlertas.map(p => `
      <div class="alert-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid var(--sidebar-border); gap: 1rem;">
        <div>
          <div style="font-size:0.85rem; font-weight:700; color: var(--text-dark);">${p.nombre}</div>
          <div style="font-size:0.72rem; color:var(--text-muted);">Bodega Principal</div>
        </div>
        <div style="text-align:right; flex-shrink: 0;">
          <div style="font-size:0.85rem; color:#ef4444; font-weight:700;">${p.stock_actual} unidad</div>
          <div style="font-size:0.68rem; color:var(--text-muted);">Mín. ${p.stock_minimo}</div>
        </div>
      </div>
    `).join('');
  }

  const dashMovContainer = document.getElementById('dash-movements');
  if (movimientos.length === 0) {
    dashMovContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem;">Sin movimientos recientes.</p>';
  } else {
    dashMovContainer.innerHTML = movimientos.slice(0, 3).map(m => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding: 0.5rem 0; border-bottom:1px solid var(--sidebar-border)">
        <div>
          <span class="badge ${m.tipo === 'ENTRADA' ? 'badge-in' : 'badge-out'}">${m.tipo}</span>
          <strong style="font-size:0.85rem; margin-left:0.3rem;">${m.productos?.nombre || 'Producto'}</strong>
          <div style="font-size:0.72rem; color:var(--text-muted);">${m.concepto}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.85rem; font-weight:700;">${m.cantidad} un.</div>
          <div style="font-size:0.68rem; color:var(--text-muted);">${new Date(m.fecha).toLocaleDateString()}</div>
        </div>
      </div>
    `).join('');
  }
}

// ==========================================
// 4. MÓDULO MATERIALES / PRODUCTOS (EDICIÓN)
// ==========================================
function renderizarTablaInventario(productos) {
  const tbody = document.getElementById('inventory-table-body');
  if (!tbody) return;
  if (!productos || productos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No hay productos registrados.</td></tr>';
    return;
  }
  tbody.innerHTML = productos.map(p => `
    <tr>
      <td><b>${p.sku || ''}</b></td>
      <td>${p.nombre || ''}</td>
      <td>${p.categoria || ''}</td>
      <td style="color:${p.stock_actual <= p.stock_minimo ? 'red' : 'inherit'}; font-weight:bold;">${p.stock_actual ?? 0}</td>
      <td>$${Number(p.costo_unitario || 0).toFixed(2)}</td>
      <td><span style="font-size:0.8rem; color:var(--text-muted);">${p.updated_by || 'Sistema'}</span></td>
      <td>
        <button onclick="prepararEdicionProducto('${p.id}')" style="color:var(--primary-blue); border:none; background:none; cursor:pointer; font-weight:600; margin-right: 0.5rem;">Editar</button>
        <button onclick="eliminarProducto('${p.id}')" style="color:#ef4444; border:none; background:none; cursor:pointer; font-weight:600;">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

async function prepararEdicionProducto(id) {
  const { data: p, error } = await _supabase.from('productos').select('*').eq('id', id).single();
  if (error) return alert('Error al consultar producto: ' + error.message);

  productoEditandoId = id;
  document.getElementById('prod-sku').value = p.sku;
  document.getElementById('prod-nombre').value = p.nombre;
  document.getElementById('prod-categoria').value = p.categoria;
  document.getElementById('prod-stock').value = p.stock_actual;
  document.getElementById('prod-min').value = p.stock_minimo;
  document.getElementById('prod-costo').value = p.costo_unitario;

  openModal();
}

async function guardarProducto(e) {
  e.preventDefault();
  const prodData = {
    sku: document.getElementById('prod-sku').value,
    nombre: document.getElementById('prod-nombre').value,
    categoria: document.getElementById('prod-categoria').value,
    stock_actual: Number(document.getElementById('prod-stock').value),
    stock_minimo: Number(document.getElementById('prod-min').value),
    costo_unitario: Number(document.getElementById('prod-costo').value),
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema'
  };

  let res;
  if (productoEditandoId) {
    res = await _supabase.from('productos').update(prodData).eq('id', productoEditandoId);
  } else {
    res = await _supabase.from('productos').insert([prodData]);
  }

  if (res.error) alert('Error al guardar producto: ' + res.error.message);
  else {
    productoEditandoId = null;
    closeModal();
    document.getElementById('product-form').reset();
    cargarDatos();
  }
}

async function eliminarProducto(id) {
  if (confirm('¿Eliminar producto?')) {
    const { error } = await _supabase.from('productos').delete().eq('id', id);
    if (error) alert('Error al eliminar: ' + error.message);
    else cargarDatos();
  }
}

// ==========================================
// POBLAR SELECTS (DESPLEGABLES DINÁMICOS Y FILTRADOS)
// ==========================================
function poblarSelectProductos(productos) {
  const selectMov = document.getElementById('mov-producto');
  const selectCompra = document.getElementById('compra-producto');
  const selectSalida = document.getElementById('salida-producto');
  const selectCesta = document.getElementById('cesta-producto-select');
  const selectReq = document.getElementById('req-producto-select');

  const prodOrdenados = [...productos].sort((a, b) => a.nombre.localeCompare(b.nombre));

  const optionsTodas = '<option value="">Seleccione Producto</option>' + 
    prodOrdenados.map(p => `<option value="${p.id}" data-sku="${p.sku}" data-nombre="${p.nombre}" data-cat="${p.categoria}">${p.nombre} (Stock: ${p.stock_actual})</option>`).join('');

  const prodDisponibles = prodOrdenados.filter(p => p.stock_actual > 0);
  const optionsSoloDisponibles = '<option value="">Seleccione Producto</option>' + 
    prodDisponibles.map(p => `<option value="${p.id}" data-sku="${p.sku}" data-nombre="${p.nombre}" data-cat="${p.categoria}" data-stock="${p.stock_actual}">${p.nombre} (Disponible: ${p.stock_actual})</option>`).join('');

  if (selectMov) selectMov.innerHTML = optionsTodas;
  if (selectCompra) selectCompra.innerHTML = optionsTodas;
  if (selectSalida) selectSalida.innerHTML = optionsSoloDisponibles;
  if (selectCesta) selectCesta.innerHTML = optionsSoloDisponibles;
  if (selectReq) selectReq.innerHTML = optionsSoloDisponibles;
}

function poblarSelectObras(obras) {
  const selectSalidaObra = document.getElementById('salida-obra');
  const selectCestaObra = document.getElementById('cesta-obra');
  const selectReqObra = document.getElementById('req-obra');

  const obrasOrdenadas = [...obras].sort((a, b) => {
    const nomA = a.direccion || a.nombre || '';
    const nomB = b.direccion || b.nombre || '';
    return nomA.localeCompare(nomB);
  });

  const options = '<option value="">Seleccione Obra</option>' + 
    obrasOrdenadas.map(o => `<option value="${o.direccion || o.nombre}">${o.direccion || o.nombre} ${o.lote && o.lote !== 'N/A' ? ' (' + o.lote + ')' : ''}</option>`).join('');

  if (selectSalidaObra) selectSalidaObra.innerHTML = options;
  if (selectCestaObra) selectCestaObra.innerHTML = options;
  if (selectReqObra) selectReqObra.innerHTML = options;
}

function poblarSelectContratistas(contratistas) {
  const selectSalidaCnt = document.getElementById('salida-solicitante');
  const selectCestaCnt = document.getElementById('cesta-contratista');
  const selectReqCnt = document.getElementById('req-contratista');

  const cntOrdenados = [...contratistas].sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''));

  const options = '<option value="">Seleccione Contratista</option>' + 
    cntOrdenados.map(c => {
      const nombreCompleto = `${c.first_name || ''} ${c.middle_name || ''} ${c.last_name || ''}`.replace(/\s+/g, ' ').trim();
      return `<option value="${nombreCompleto}">${nombreCompleto} ${c.phone ? ' - ' + c.phone : ''}</option>`;
    }).join('');

  if (selectSalidaCnt) selectSalidaCnt.innerHTML = options;
  if (selectCestaCnt) selectCestaCnt.innerHTML = options;
  if (selectReqCnt) selectReqCnt.innerHTML = options;
}

function poblarSelectProveedores(proveedores) {
  const selectCompraProv = document.getElementById('compra-proveedor');
  if (!selectCompraProv) return;

  const provOrdenados = [...proveedores].sort((a, b) => (a.nombre_empresa || '').localeCompare(b.nombre_empresa || ''));

  if (selectCompraProv.tagName === 'SELECT') {
    const options = '<option value="">Seleccione Proveedor</option>' + 
      provOrdenados.map(p => `<option value="${p.nombre_empresa}">${p.nombre_empresa}</option>`).join('');
    selectCompraProv.innerHTML = options;
  }
}

// ==========================================
// 5. ENTRADAS / COMPRAS
// ==========================================
function calcularTotalCompra() {
  const cant = Number(document.getElementById('compra-cantidad').value) || 0;
  const costo = Number(document.getElementById('compra-costo').value) || 0;
  const total = cant * costo;
  
  const display = document.getElementById('compra-total-display');
  if (display) {
    display.innerText = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

async function registrarCompra(e) {
  e.preventDefault();

  const prodId = document.getElementById('compra-producto').value;
  const proveedor = document.getElementById('compra-proveedor').value;
  const factura = document.getElementById('compra-factura').value;
  const cantidad = Number(document.getElementById('compra-cantidad').value);
  const costoUnitario = Number(document.getElementById('compra-costo').value);
  const total = cantidad * costoUnitario;
  const estadoPago = document.getElementById('compra-estado-pago').value;
  const codigoLote = document.getElementById('compra-lote').value;
  const vencProd = document.getElementById('compra-venc-prod').value || null;
  const notas = document.getElementById('compra-notas').value;

  const { data: prod, error: errProd } = await _supabase.from('productos').select('stock_actual').eq('id', prodId).single();
  if (errProd) return alert('Error al consultar el producto seleccionado');

  const nuevoStock = prod.stock_actual + cantidad;

  const { error: errCompra } = await _supabase.from('compras').insert([{
    producto_id: prodId,
    proveedor,
    factura,
    cantidad,
    costo_unitario: costoUnitario,
    total,
    estado_pago: estadoPago,
    codigo_lote: codigoLote,
    vencimiento_producto: vencProd,
    notas,
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema'
  }]);

  if (errCompra) return alert('Error al registrar la compra: ' + errCompra.message);

  await _supabase.from('movimientos').insert([{
    producto_id: prodId,
    tipo: 'ENTRADA',
    cantidad,
    concepto: `Compra Factura: ${factura} (${proveedor})`,
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema'
  }]);

  await _supabase.from('productos').update({ 
    stock_actual: nuevoStock,
    costo_unitario: costoUnitario,
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema'
  }).eq('id', prodId);

  alert('¡Compra registrada con éxito!');
  document.getElementById('purchase-form').reset();
  
  const display = document.getElementById('compra-total-display');
  if (display) display.innerText = '$0.00';

  cargarDatos();
}

async function cargarHistorialCompras() {
  const tbody = document.getElementById('purchases-table-body');
  if (!tbody) return;

  const { data: compras, error } = await _supabase
    .from('compras')
    .select('*, productos(nombre)')
    .order('fecha', { ascending: false });

  if (error || !compras || compras.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">No hay compras registradas.</td></tr>';
    return;
  }

  tbody.innerHTML = compras.map(c => `
    <tr>
      <td>${new Date(c.fecha).toLocaleDateString()}</td>
      <td><b>${c.factura}</b></td>
      <td>${c.productos?.nombre || 'General'}</td>
      <td>${c.proveedor}</td>
      <td>${c.cantidad}</td>
      <td>$${Number(c.costo_unitario).toFixed(2)}</td>
      <td><b>$${Number(c.total).toFixed(2)}</b></td>
      <td><span class="badge ${c.estado_pago === 'Pagada' ? 'badge-in' : 'badge-out'}">${c.estado_pago}</span></td>
      <td><span style="font-size:0.8rem; color:var(--text-muted);">${c.updated_by || 'Sistema'}</span></td>
    </tr>
  `).join('');
}

// ==========================================
// 6. SALIDAS / ENTREGAS
// ==========================================
async function registrarSalidaModule(e) {
  e.preventDefault();

  const prodId = document.getElementById('salida-producto').value;
  const obra = document.getElementById('salida-obra').value;
  const solicitante = document.getElementById('salida-solicitante').value;
  const cantidad = Number(document.getElementById('salida-cantidad').value);
  const motivo = document.getElementById('salida-motivo').value;

  const { data: prod, error: errProd } = await _supabase.from('productos').select('stock_actual, nombre').eq('id', prodId).single();
  if (errProd) return alert('Error al consultar el producto seleccionado');

  if (prod.stock_actual < cantidad) {
    return alert(`Stock insuficiente. Intentas entregar ${cantidad} un., pero solo hay ${prod.stock_actual} un. disponibles.`);
  }

  const nuevoStock = prod.stock_actual - cantidad;

  const { error: errSalida } = await _supabase.from('salidas').insert([{
    producto_id: prodId,
    obra_destino: obra,
    solicitante,
    cantidad,
    motivo,
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema'
  }]);

  if (errSalida) return alert('Error al registrar la salida: ' + errSalida.message);

  await _supabase.from('movimientos').insert([{
    producto_id: prodId,
    tipo: 'SALIDA',
    cantidad,
    concepto: `Entrega a: ${obra} (Recibe: ${solicitante})`,
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema'
  }]);

  await _supabase.from('productos').update({ 
    stock_actual: nuevoStock,
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema'
  }).eq('id', prodId);

  alert('¡Salida registrada con éxito!');
  document.getElementById('dispatch-form').reset();
  cargarDatos();
}

async function cargarHistorialSalidas() {
  const tbody = document.getElementById('dispatches-table-body');
  if (!tbody) return;

  const { data: salidas, error } = await _supabase
    .from('salidas')
    .select('*, productos(nombre)')
    .order('fecha', { ascending: false });

  if (error || !salidas || salidas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No hay salidas registradas.</td></tr>';
    return;
  }

  tbody.innerHTML = salidas.map(s => `
    <tr>
      <td>${new Date(s.fecha).toLocaleDateString()}</td>
      <td><b>${s.productos?.nombre || 'General'}</b></td>
      <td>${s.obra_destino}</td>
      <td>${s.solicitante}</td>
      <td style="color:#ef4444; font-weight:bold;">-${s.cantidad}</td>
      <td>${s.motivo}</td>
      <td><span style="font-size:0.8rem; color:var(--text-muted);">${s.updated_by || 'Sistema'}</span></td>
    </tr>
  `).join('');
}

// ==========================================
// 7. CESTA DE ENTREGA (CONDUCE)
// ==========================================
function agregarACesta() {
  const select = document.getElementById('cesta-producto-select');
  const prodId = select.value;
  const cantidad = Number(document.getElementById('cesta-cantidad-input').value) || 1;

  if (!prodId) return alert('Por favor seleccione un material de la lista.');

  const optionSelected = select.options[select.selectedIndex];
  const sku = optionSelected.getAttribute('data-sku');
  const nombre = optionSelected.getAttribute('data-nombre');
  const categoria = optionSelected.getAttribute('data-cat');

  const existe = cestaMateriales.find(item => item.id === prodId);
  if (existe) {
    existe.cantidad += cantidad;
  } else {
    cestaMateriales.push({ id: prodId, sku, nombre, categoria, cantidad });
  }

  document.getElementById('cesta-cantidad-input').value = '';
  renderizarCesta();
}

function removerDeCesta(index) {
  cestaMateriales.splice(index, 1);
  renderizarCesta();
}

function renderizarCesta() {
  const tbody = document.getElementById('cesta-items-body');
  if (!tbody) return;

  if (cestaMateriales.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">La cesta está vacía. Seleccione materiales arriba.</td></tr>';
    return;
  }

  tbody.innerHTML = cestaMateriales.map((item, idx) => `
    <tr>
      <td><b>${item.sku}</b></td>
      <td>${item.nombre}</td>
      <td>${item.categoria}</td>
      <td style="text-align:center; font-weight:bold; font-size:1rem;">${item.cantidad}</td>
      <td class="no-print" style="text-align:center;">
        <button onclick="removerDeCesta(${idx})" style="color:#ef4444; border:none; background:none; cursor:pointer; font-weight:600;">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

function imprimirConduce() {
  if (cestaMateriales.length === 0) {
    return alert('Agregue al menos un material a la cesta antes de imprimir.');
  }

  const obra = document.getElementById('cesta-obra').value || 'N/A';
  const contratista = document.getElementById('cesta-contratista').value || 'N/A';
  const entregado = document.getElementById('cesta-entregado').value || (usuarioActual ? usuarioActual.nombre : 'N/A');
  const fechaActual = new Date().toLocaleDateString('es-NI');

  document.getElementById('print-obra').innerText = obra;
  document.getElementById('print-contratista').innerText = contratista;
  document.getElementById('print-entregado').innerText = entregado;
  document.getElementById('print-fecha').innerText = fechaActual;

  window.print();
}

// ==========================================
// 8. MÓDULO PROYECTOS / OBRAS (CON EDICIÓN)
// ==========================================
async function registrarObra(e) {
  e.preventDefault();
  const id = document.getElementById('obra-id') ? document.getElementById('obra-id').value : null;
  const direccion = document.getElementById('obra-direccion').value.trim();

  const obraData = {
    nombre: direccion,
    direccion: direccion,
    lote: document.getElementById('obra-lote').value.trim() || 'N/A',
    fase: document.getElementById('obra-fase').value.trim() || 'N/A',
    subdivision: document.getElementById('obra-subdivision').value.trim() || 'N/A',
    codigo_postal: document.getElementById('obra-zip').value.trim() || 'N/A',
    county: document.getElementById('obra-county').value.trim() || 'N/A',
    estado: 'Activa',
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema'
  };

  let res;
  if (id) {
    res = await _supabase.from('obras').update(obraData).eq('id', id);
  } else {
    res = await _supabase.from('obras').insert([obraData]);
  }

  if (res.error) return alert('Error al guardar la obra: ' + res.error.message);

  alert(id ? '¡Obra actualizada con éxito!' : '¡Proyecto registrado con éxito!');
  document.getElementById('obra-form').reset();
  if (document.getElementById('obra-id')) document.getElementById('obra-id').value = '';
  cargarDatos();
}

function renderizarTablaObras(obras) {
  const tbody = document.getElementById('obras-table-body');
  if (!tbody) return;

  if (!obras || obras.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color: var(--text-muted);">No hay obras registradas.</td></tr>';
    return;
  }

  tbody.innerHTML = obras.map(o => `
    <tr>
      <td><b>${o.direccion || o.nombre || 'N/A'}</b></td>
      <td>${o.lote || 'N/A'}</td>
      <td>${o.fase || 'N/A'}</td>
      <td>${o.subdivision || 'N/A'}</td>
      <td>${o.codigo_postal || 'N/A'}</td>
      <td>${o.county || 'N/A'}</td>
      <td><span class="badge badge-in">${o.estado || 'Activa'}</span></td>
      <td><span style="font-size:0.8rem; color:var(--text-muted);">${o.updated_by || 'Sistema'}</span></td>
      <td>
        <button onclick="prepararEdicionObra('${o.id}')" style="color:var(--primary-blue); border:none; background:none; cursor:pointer; font-weight:600; margin-right: 0.5rem;">Editar</button>
        <button onclick="eliminarObra('${o.id}')" style="color:#ef4444; border:none; background:none; cursor:pointer; font-weight:600;">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

async function prepararEdicionObra(id) {
  const { data: o, error } = await _supabase.from('obras').select('*').eq('id', id).single();
  if (error) return alert('Error al consultar la obra');

  if (!document.getElementById('obra-id')) {
    const inputId = document.createElement('input');
    inputId.type = 'hidden';
    inputId.id = 'obra-id';
    document.getElementById('obra-form').appendChild(inputId);
  }

  document.getElementById('obra-id').value = o.id;
  document.getElementById('obra-direccion').value = o.direccion || '';
  document.getElementById('obra-lote').value = o.lote !== 'N/A' ? o.lote : '';
  document.getElementById('obra-fase').value = o.fase !== 'N/A' ? o.fase : '';
  document.getElementById('obra-subdivision').value = o.subdivision !== 'N/A' ? o.subdivision : '';
  document.getElementById('obra-zip').value = o.codigo_postal !== 'N/A' ? o.codigo_postal : '';
  document.getElementById('obra-county').value = o.county !== 'N/A' ? o.county : '';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function eliminarObra(id) {
  if (confirm('¿Desea eliminar esta obra del sistema?')) {
    const { error } = await _supabase.from('obras').delete().eq('id', id);
    if (error) alert('Error al eliminar obra: ' + error.message);
    else cargarDatos();
  }
}

// ==========================================
// 9. MÓDULO CONTRATISTAS (CON EDICIÓN)
// ==========================================
async function registrarContratista(e) {
  e.preventDefault();
  const id = document.getElementById('cnt-id') ? document.getElementById('cnt-id').value : null;

  const cntData = {
    first_name: document.getElementById('cnt-first-name').value.trim(),
    middle_name: document.getElementById('cnt-middle-name').value.trim(),
    last_name: document.getElementById('cnt-last-name').value.trim(),
    phone: document.getElementById('cnt-phone').value.trim(),
    email: document.getElementById('cnt-email').value.trim(),
    birth_date: document.getElementById('cnt-birth-date').value || null,
    ssn: document.getElementById('cnt-ssn').value.trim(),
    itin: document.getElementById('cnt-itin').value.trim(),
    address: document.getElementById('cnt-address').value.trim(),
    city: document.getElementById('cnt-city').value.trim(),
    state: document.getElementById('cnt-state').value,
    zip: document.getElementById('cnt-zip').value.trim(),
    status: document.getElementById('cnt-status').value,
    summary: document.getElementById('cnt-summary').value,
    notify_on_updates: document.getElementById('cnt-notify').value.trim(),
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema'
  };

  let res;
  if (id) {
    res = await _supabase.from('contratistas').update(cntData).eq('id', id);
  } else {
    res = await _supabase.from('contratistas').insert([cntData]);
  }

  if (res.error) return alert('Error saving contractor: ' + res.error.message);

  alert(id ? '¡Contractor updated successfully!' : '¡Contractor saved successfully!');
  document.getElementById('contractor-form').reset();
  if (document.getElementById('cnt-id')) document.getElementById('cnt-id').value = '';
  cargarDatos();
}

async function cargarContratistas(contratistasList) {
  const tbody = document.getElementById('contractors-table-body');
  if (!tbody) return;

  let contratistas = contratistasList;
  if (!contratistas) {
    const { data, error } = await _supabase.from('contratistas').select('*');
    if (error) return console.error('Error al cargar contratistas:', error);
    contratistas = data;
  }

  if (!contratistas || contratistas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: var(--text-muted);">No contractors registered.</td></tr>';
    return;
  }

  tbody.innerHTML = contratistas.map(c => `
    <tr>
      <td><b>${c.first_name || ''} ${c.middle_name || ''} ${c.last_name || ''}</b></td>
      <td>${c.phone || 'N/A'}</td>
      <td>${c.email || 'N/A'}</td>
      <td>${c.ssn || c.itin || 'N/A'}</td>
      <td>${c.address ? `${c.address}, ${c.city || ''}` : 'N/A'}</td>
      <td><span class="badge badge-in">${c.status || 'Active Contractor'}</span></td>
      <td><span style="font-size:0.8rem; color:var(--text-muted);">${c.updated_by || 'Sistema'}</span></td>
      <td>
        <button onclick="prepararEdicionContratista('${c.id}')" style="color:var(--primary-blue); border:none; background:none; cursor:pointer; font-weight:600; margin-right:0.5rem;">Edit</button>
        <button onclick="eliminarContratista('${c.id}')" style="color:#ef4444; border:none; background:none; cursor:pointer; font-weight:600;">Delete</button>
      </td>
    </tr>
  `).join('');
}

async function prepararEdicionContratista(id) {
  const { data: c, error } = await _supabase.from('contratistas').select('*').eq('id', id).single();
  if (error) return alert('Error fetching contractor');

  if (!document.getElementById('cnt-id')) {
    const inputId = document.createElement('input');
    inputId.type = 'hidden';
    inputId.id = 'cnt-id';
    document.getElementById('contractor-form').appendChild(inputId);
  }

  document.getElementById('cnt-id').value = c.id;
  document.getElementById('cnt-first-name').value = c.first_name || '';
  document.getElementById('cnt-middle-name').value = c.middle_name || '';
  document.getElementById('cnt-last-name').value = c.last_name || '';
  document.getElementById('cnt-phone').value = c.phone || '';
  document.getElementById('cnt-email').value = c.email || '';
  document.getElementById('cnt-birth-date').value = c.birth_date || '';
  document.getElementById('cnt-ssn').value = c.ssn || '';
  document.getElementById('cnt-itin').value = c.itin || '';
  document.getElementById('cnt-address').value = c.address || '';
  document.getElementById('cnt-city').value = c.city || '';
  document.getElementById('cnt-state').value = c.state || 'Texas';
  document.getElementById('cnt-zip').value = c.zip || '';
  document.getElementById('cnt-status').value = c.status || 'Active Contractor';
  document.getElementById('cnt-summary').value = c.summary || 'Currently Employed at Broadway';
  document.getElementById('cnt-notify').value = c.notify_on_updates || '';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function eliminarContratista(id) {
  if (confirm('Are you sure you want to delete this contractor?')) {
    const { error } = await _supabase.from('contratistas').delete().eq('id', id);
    if (error) alert('Error deleting: ' + error.message);
    else cargarDatos();
  }
}

// ==========================================
// 10. MÓDULO PROVEEDORES (CON EDICIÓN)
// ==========================================
async function registrarProveedor(e) {
  e.preventDefault();
  const id = document.getElementById('prov-id') ? document.getElementById('prov-id').value : null;

  const provData = {
    nombre_empresa: document.getElementById('prov-nombre').value.trim(),
    contacto_principal: document.getElementById('prov-contacto').value.trim(),
    tax_id: document.getElementById('prov-tax').value.trim(),
    telefono: document.getElementById('prov-telefono').value.trim(),
    email: document.getElementById('prov-email').value.trim(),
    direccion: document.getElementById('prov-direccion').value.trim(),
    categoria: document.getElementById('prov-categoria').value,
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema'
  };

  let res;
  if (id) {
    res = await _supabase.from('proveedores').update(provData).eq('id', id);
  } else {
    res = await _supabase.from('proveedores').insert([provData]);
  }

  if (res.error) return alert('Error al guardar el proveedor: ' + res.error.message);

  alert(id ? '¡Proveedor actualizado con éxito!' : '¡Proveedor guardado con éxito!');
  document.getElementById('provider-form').reset();
  if (document.getElementById('prov-id')) document.getElementById('prov-id').value = '';
  cargarDatos();
}

function renderizarTablaProveedores(proveedores) {
  const tbody = document.getElementById('providers-table-body');
  if (!tbody) return;

  if (!proveedores || proveedores.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: var(--text-muted);">No hay proveedores registrados.</td></tr>';
    return;
  }

  tbody.innerHTML = proveedores.map(p => `
    <tr>
      <td><b>${p.nombre_empresa}</b></td>
      <td>${p.contacto_principal || 'N/A'}</td>
      <td>${p.telefono || 'N/A'}</td>
      <td>${p.email || 'N/A'}</td>
      <td>${p.categoria || 'General'}</td>
      <td>${p.tax_id || 'N/A'}</td>
      <td><span style="font-size:0.8rem; color:var(--text-muted);">${p.updated_by || 'Sistema'}</span></td>
      <td>
        <button onclick="prepararEdicionProveedor('${p.id}')" style="color:var(--primary-blue); border:none; background:none; cursor:pointer; font-weight:600; margin-right:0.5rem;">Editar</button>
        <button onclick="eliminarProveedor('${p.id}')" style="color:#ef4444; border:none; background:none; cursor:pointer; font-weight:600;">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

async function prepararEdicionProveedor(id) {
  const { data: p, error } = await _supabase.from('proveedores').select('*').eq('id', id).single();
  if (error) return alert('Error al consultar proveedor');

  if (!document.getElementById('prov-id')) {
    const inputId = document.createElement('input');
    inputId.type = 'hidden';
    inputId.id = 'prov-id';
    document.getElementById('provider-form').appendChild(inputId);
  }

  document.getElementById('prov-id').value = p.id;
  document.getElementById('prov-nombre').value = p.nombre_empresa || '';
  document.getElementById('prov-contacto').value = p.contacto_principal || '';
  document.getElementById('prov-tax').value = p.tax_id || '';
  document.getElementById('prov-telefono').value = p.telefono || '';
  document.getElementById('prov-email').value = p.email || '';
  document.getElementById('prov-direccion').value = p.direccion || '';
  document.getElementById('prov-categoria').value = p.categoria || 'General';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function eliminarProveedor(id) {
  if (confirm('¿Desea eliminar este proveedor?')) {
    const { error } = await _supabase.from('proveedores').delete().eq('id', id);
    if (error) alert('Error al eliminar proveedor: ' + error.message);
    else cargarDatos();
  }
}

// ==========================================
// 11. MÓDULO REQUESTS / SOLICITUDES CON RESERVA Y FILTRO
// ==========================================
function agregarItemRequest() {
  const select = document.getElementById('req-producto-select');
  const prodId = select.value;
  const cantidadInput = document.getElementById('req-cantidad-input');
  const cantidad = Number(cantidadInput.value) || 0;

  if (!prodId) return alert('Por favor seleccione un producto de la lista.');
  if (cantidad <= 0) return alert('Ingrese una cantidad válida mayor a 0.');

  const option = select.options[select.selectedIndex];
  const stockDisponible = Number(option.getAttribute('data-stock')) || 0;
  const sku = option.getAttribute('data-sku');
  const nombre = option.getAttribute('data-nombre');
  const categoria = option.getAttribute('data-cat');

  const acumuladoPrevio = listaRequestTemp.filter(i => i.producto_id === prodId).reduce((sum, i) => sum + i.cantidad, 0);
  const totalSolicitado = acumuladoPrevio + cantidad;

  if (totalSolicitado > stockDisponible) {
    return alert(`Error: Stock insuficiente. Tienes ${stockDisponible} un. disponibles e intentas solicitar un total de ${totalSolicitado} un.`);
  }

  const existe = listaRequestTemp.find(item => item.producto_id === prodId);
  if (existe) {
    existe.cantidad += cantidad;
  } else {
    listaRequestTemp.push({ producto_id: prodId, sku, nombre, categoria, cantidad, stockDisponible });
  }

  cantidadInput.value = '';
  renderizarTablaRequestTemp();
}

function removerItemRequest(idx) {
  listaRequestTemp.splice(idx, 1);
  renderizarTablaRequestTemp();
}

function renderizarTablaRequestTemp() {
  const tbody = document.getElementById('req-items-body');
  if (!tbody) return;

  if (listaRequestTemp.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No hay materiales agregados a esta solicitud.</td></tr>';
    return;
  }

  tbody.innerHTML = listaRequestTemp.map((item, idx) => `
    <tr>
      <td><b>${item.sku}</b></td>
      <td>${item.nombre}</td>
      <td>${item.categoria}</td>
      <td style="text-align:center; font-weight:bold;">${item.cantidad}</td>
      <td style="text-align:center;">
        <button onclick="removerItemRequest(${idx})" style="color:#ef4444; border:none; background:none; cursor:pointer; font-weight:600;">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

// RESERVA INMEDIATA AL CREAR EL REQUEST
async function guardarRequest() {
  const obra = document.getElementById('req-obra').value;
  const contratista = document.getElementById('req-contratista').value;
  const notas = document.getElementById('req-notas').value.trim();

  if (!obra || !contratista) return alert('Por favor seleccione la obra y el contratista.');
  if (listaRequestTemp.length === 0) return alert('Agregue al menos un material a la solicitud.');

  const { data: req, error: errReq } = await _supabase.from('requests').insert([{
    obra_destino: obra,
    solicitante: contratista,
    notas,
    estado: 'Pendiente',
    created_by: usuarioActual ? usuarioActual.nombre : 'WFH User'
  }]).select().single();

  if (errReq) return alert('Error al crear la solicitud: ' + errReq.message);

  for (const item of listaRequestTemp) {
    await _supabase.from('request_items').insert([{
      request_id: req.id,
      producto_id: item.producto_id,
      cantidad: item.cantidad
    }]);

    const { data: prod } = await _supabase.from('productos').select('stock_actual').eq('id', item.producto_id).single();
    if (prod) {
      const nuevoStock = Math.max(0, prod.stock_actual - item.cantidad);
      await _supabase.from('productos').update({
        stock_actual: nuevoStock,
        updated_by: usuarioActual ? usuarioActual.nombre : 'WFH User'
      }).eq('id', item.producto_id);
    }
  }

  alert('¡Request creado con éxito! Los materiales se han reservado del inventario.');
  listaRequestTemp = [];
  renderizarTablaRequestTemp();
  document.getElementById('req-obra').value = '';
  document.getElementById('req-contratista').value = '';
  document.getElementById('req-notas').value = '';
  cargarDatos();
}

async function cargarHistorialRequests() {
  const tbody = document.getElementById('requests-table-body');
  if (!tbody) return;

  const { data: requests, error } = await _supabase
    .from('requests')
    .select('*, request_items(*, productos(*))')
    .order('fecha', { ascending: false });

  if (error || !requests || requests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">No hay solicitudes registradas.</td></tr>';
    return;
  }

  tbody.innerHTML = requests.map(r => {
    const resumenMateriales = (r.request_items || []).map(i => `${i.productos?.nombre || 'Producto'}: <b>${i.cantidad} un.</b>`).join('<br>');
    const esPendiente = r.estado === 'Pendiente';
    const esCancelado = r.estado === 'Cancelado';

    let badgeClass = 'badge-in';
    if (esPendiente) badgeClass = 'badge-out';
    if (esCancelado) badgeClass = 'border-red';

    return `
      <tr>
        <td>${new Date(r.fecha).toLocaleDateString()} ${new Date(r.fecha).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
        <td><b>${r.obra_destino}</b></td>
        <td>${r.solicitante}</td>
        <td style="font-size:0.82rem;">${resumenMateriales}</td>
        <td>
          <span class="badge ${badgeClass}" style="${esCancelado ? 'color:#ef4444; border:1px solid #ef4444; background:#fef2f2;' : ''}">${r.estado}</span>
        </td>
        <td><span style="font-size:0.8rem; color:var(--text-muted);">${r.created_by || 'WFH'}</span></td>
        <td>
          <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
            ${esPendiente ? `
              <button onclick="despacharRequest('${r.id}')" class="btn-primary" style="padding:0.35rem 0.65rem; font-size:0.75rem; background:var(--header-green);">
                Despachar
              </button>
              <button onclick="cancelarRequest('${r.id}')" style="padding:0.35rem 0.65rem; font-size:0.75rem; background:#ef4444; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:600;">
                Cancelar
              </button>
            ` : ''}

            ${!esCancelado ? `
              <button onclick="cargarRequestEnCesta('${r.id}')" class="btn-secondary" style="padding:0.35rem 0.65rem; font-size:0.75rem; background:var(--primary-blue); color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:600; display:flex; align-items:center; gap:0.3rem;">
                <i data-lucide="shopping-bag" style="width:12px; height:12px;"></i> Abrir en Cesta
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

// CARGAR DETALLES DEL REQUEST DIRECTAMENTE EN LA CESTA
async function cargarRequestEnCesta(requestId) {
  const { data: req, error } = await _supabase
    .from('requests')
    .select('*, request_items(*, productos(*))')
    .eq('id', requestId)
    .single();

  if (error || !req) return alert('Error al cargar los detalles del Request.');

  const selectObra = document.getElementById('cesta-obra');
  const selectCnt = document.getElementById('cesta-contratista');
  const inputEntregado = document.getElementById('cesta-entregado');

  if (selectObra) selectObra.value = req.obra_destino;
  if (selectCnt) selectCnt.value = req.solicitante;
  if (inputEntregado) inputEntregado.value = usuarioActual ? usuarioActual.nombre : (req.despachado_por || 'Despachador Bodega');

  cestaMateriales = (req.request_items || []).map(item => ({
    id: item.producto_id,
    sku: item.productos?.sku || 'N/A',
    nombre: item.productos?.nombre || 'Producto',
    categoria: item.productos?.categoria || 'General',
    cantidad: item.cantidad
  }));

  renderizarCesta();
  switchTab('movil');

  setTimeout(() => {
    const printArea = document.querySelector('.print-area');
    if (printArea) printArea.scrollIntoView({ behavior: 'smooth' });
  }, 200);
}

// APROBACIÓN DEFINITIVA Y REGISTRO EN SALIDAS / KARDEX
async function despacharRequest(requestId) {
  if (!confirm('¿Confirmas que deseas despachar este Request y formalizar la entrega?')) return;

  const { data: req, error: errReq } = await _supabase
    .from('requests')
    .select('*, request_items(*, productos(stock_actual, nombre))')
    .eq('id', requestId)
    .single();

  if (errReq || !req) return alert('Error al cargar datos de la solicitud');

  for (const item of req.request_items) {
    await _supabase.from('salidas').insert([{
      producto_id: item.producto_id,
      obra_destino: req.obra_destino,
      solicitante: req.solicitante,
      cantidad: item.cantidad,
      motivo: `Request Despachado (Solicitó: ${req.created_by})`,
      updated_by: usuarioActual ? usuarioActual.nombre : 'Gerente Obra'
    }]);

    await _supabase.from('movimientos').insert([{
      producto_id: item.producto_id,
      tipo: 'SALIDA',
      cantidad: item.cantidad,
      concepto: `Despacho de Request a: ${req.obra_destino}`,
      updated_by: usuarioActual ? usuarioActual.nombre : 'Gerente Obra'
    }]);
  }

  await _supabase.from('requests').update({
    estado: 'Completado',
    despachado_por: usuarioActual ? usuarioActual.nombre : 'Gerente Obra',
    fecha_despacho: new Date()
  }).eq('id', requestId);

  alert('¡Request despachado! Se ha formalizado el registro en Salidas e Historial.');
  cargarDatos();
}

// CANCELACIÓN DE REQUEST Y DEVOLUCIÓN AUTOMÁTICA DE STOCK
async function cancelarRequest(requestId) {
  if (!confirm('¿Seguro que deseas cancelar este Request? Los materiales reservados regresarán automáticamente al inventario.')) return;

  const { data: req, error: errReq } = await _supabase
    .from('requests')
    .select('*, request_items(*)')
    .eq('id', requestId)
    .single();

  if (errReq || !req) return alert('Error al cargar la solicitud');

  for (const item of req.request_items) {
    const { data: prod } = await _supabase.from('productos').select('stock_actual').eq('id', item.producto_id).single();
    if (prod) {
      const stockDevuelto = prod.stock_actual + item.cantidad;
      await _supabase.from('productos').update({
        stock_actual: stockDevuelto,
        updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema'
      }).eq('id', item.producto_id);
    }
  }

  await _supabase.from('requests').update({
    estado: 'Cancelado',
    despachado_por: usuarioActual ? usuarioActual.nombre : 'Sistema'
  }).eq('id', requestId);

  alert('Request cancelado. Los materiales se han devuelto al inventario.');
  cargarDatos();
}

// ==========================================
// 12. MOVIMIENTOS Y NAVEGACIÓN TAB
// ==========================================
async function registrarMovimiento(e) {
  e.preventDefault();
  const prodId = document.getElementById('mov-producto').value;
  const tipo = document.getElementById('mov-tipo').value;
  const cantidad = Number(document.getElementById('mov-cantidad').value);
  const concepto = document.getElementById('mov-concepto').value;

  const { data: prod, error: errProd } = await _supabase.from('productos').select('stock_actual').eq('id', prodId).single();
  if (errProd) return alert('Error al consultar producto');

  const nuevoStock = tipo === 'ENTRADA' ? prod.stock_actual + cantidad : prod.stock_actual - cantidad;
  if (nuevoStock < 0) return alert('Error: Stock insuficiente para realizar esta salida');

  await _supabase.from('movimientos').insert([{ 
    producto_id: prodId, 
    tipo, 
    cantidad, 
    concepto,
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema' 
  }]);
  await _supabase.from('productos').update({ 
    stock_actual: nuevoStock,
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema' 
  }).eq('id', prodId);

  document.getElementById('movement-form').reset();
  cargarDatos();
}

async function renderizarMovimientos(movimientos) {
  const tbody = document.getElementById('movements-table-body');
  if (!tbody) return;
  if (movimientos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay movimientos registrados.</td></tr>';
    return;
  }
  tbody.innerHTML = movimientos.map(m => `
    <tr>
      <td>${new Date(m.fecha).toLocaleDateString()}</td>
      <td>${m.productos?.nombre || 'General'}</td>
      <td><span class="badge ${m.tipo === 'ENTRADA' ? 'badge-in' : 'badge-out'}">${m.tipo}</span></td>
      <td>${m.cantidad}</td>
      <td>${m.concepto}</td>
      <td><span style="font-size:0.8rem; color:var(--text-muted);">${m.updated_by || 'Sistema'}</span></td>
    </tr>
  `).join('');
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  
  const targetTab = document.getElementById(`tab-${tabId}`);
  if (targetTab) targetTab.classList.add('active');

  if (event && event.currentTarget) event.currentTarget.classList.add('active');
}

function openModal() { document.getElementById('modal-product').classList.add('open'); }
function closeModal() { 
  document.getElementById('modal-product').classList.remove('open'); 
  productoEditandoId = null;
  document.getElementById('product-form').reset();
}
