// CONFIGURACIÓN DE SUPABASE
const SUPABASE_URL = 'https://yuppkdlmjgneyzpuwupq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1cHBrZGxtamduZXl6cHV3dXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NTgyNzYsImV4cCI6MjEwNDQzNDI3Nn0.oJY0jks32BYBttOm5FYgBhAn-cIw5F6qDaXFh10No78';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let cestaMateriales = [];
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
  badge.innerText = `${usuarioActual.nombre} (${usuarioActual.rol === 'ADMIN' ? 'Admin' : 'Gerente Obra'})`;

  aplicarPermisosRol();
  cargarDatos();
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
// 2. CARGA GENERAL DE DATOS
// ==========================================
async function cargarDatos() {
  // 1. Cargar Productos
  const { data: productos, error: errProd } = await _supabase.from('productos').select('*');
  if (errProd) console.error('Error cargando productos:', errProd);

  // 2. Cargar Movimientos
  const { data: movimientos, error: errMov } = await _supabase
    .from('movimientos')
    .select('*, productos(nombre, costo_unitario)')
    .order('fecha', { ascending: false });
  if (errMov) console.error('Error cargando movimientos:', errMov);

  // 3. Cargar Obras
  const { data: obras, error: errObras } = await _supabase.from('obras').select('*');
  if (errObras) console.error('Error cargando obras:', errObras);

  // 4. Cargar Contratistas
  const { data: contratistas, error: errCnt } = await _supabase.from('contratistas').select('*');
  if (errCnt) console.error('Error cargando contratistas:', errCnt);

  // 5. Cargar Proveedores
  const { data: proveedores, error: errProv } = await _supabase.from('proveedores').select('*');
  if (errProv) console.error('Error cargando proveedores:', errProv);

  // Renderizar vistas del Dashboard e Inventario
  renderizarDashboard(productos || [], movimientos || [], obras || []);
  renderizarTablaInventario(productos || []);
  renderizarMovimientos(movimientos || []);
  cargarHistorialCompras();
  cargarHistorialSalidas();
  
  // Poblar desplegables (Selects)
  poblarSelectProductos(productos || []);
  poblarSelectObras(obras || []);
  poblarSelectContratistas(contratistas || []);
  poblarSelectProveedores(proveedores || []);

  // Renderizar tablas de módulos
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

  // KPI Y CUADRO DE OBRAS ACTIVAS
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
  if (productos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay productos registrados.</td></tr>';
    return;
  }
  tbody.innerHTML = productos.map(p => `
    <tr>
      <td><b>${p.sku}</b></td>
      <td>${p.nombre}</td>
      <td>${p.categoria}</td>
      <td style="color:${p.stock_actual <= p.stock_minimo ? 'red' : 'inherit'}; font-weight:bold;">${p.stock_actual}</td>
      <td>$${p.costo_unitario.toFixed(2)}</td>
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
    costo_unitario: Number(document.getElementById('prod-costo').value)
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
// POBLAR SELECTS (DESPLEGABLES DINÁMICOS)
// ==========================================
function poblarSelectProductos(productos) {
  const selectMov = document.getElementById('mov-producto');
  const selectCompra = document.getElementById('compra-producto');
  const selectSalida = document.getElementById('salida-producto');
  const selectCesta = document.getElementById('cesta-producto-select');

  const options = '<option value="">Seleccione Producto</option>' + 
    productos.map(p => `<option value="${p.id}" data-sku="${p.sku}" data-nombre="${p.nombre}" data-cat="${p.categoria}">${p.nombre} (Stock: ${p.stock_actual})</option>`).join('');

  if (selectMov) selectMov.innerHTML = options;
  if (selectCompra) selectCompra.innerHTML = options;
  if (selectSalida) selectSalida.innerHTML = options;
  if (selectCesta) selectCesta.innerHTML = options;
}

function poblarSelectObras(obras) {
  const selectSalidaObra = document.getElementById('salida-obra');
  const selectCestaObra = document.getElementById('cesta-obra');

  const options = '<option value="">Seleccione Obra</option>' + 
    obras.map(o => `<option value="${o.direccion || o.nombre}">${o.direccion || o.nombre} ${o.lote && o.lote !== 'N/A' ? ' (' + o.lote + ')' : ''}</option>`).join('');

  if (selectSalidaObra) selectSalidaObra.innerHTML = options;
  if (selectCestaObra) selectCestaObra.innerHTML = options;
}

function poblarSelectContratistas(contratistas) {
  const selectSalidaCnt = document.getElementById('salida-solicitante');
  const selectCestaCnt = document.getElementById('cesta-contratista');

  const options = '<option value="">Seleccione Contratista</option>' + 
    contratistas.map(c => {
      const nombreCompleto = `${c.first_name} ${c.middle_name || ''} ${c.last_name || ''}`.trim();
      return `<option value="${nombreCompleto}">${nombreCompleto} ${c.phone ? ' - ' + c.phone : ''}</option>`;
    }).join('');

  if (selectSalidaCnt) selectSalidaCnt.innerHTML = options;
  if (selectCestaCnt) selectCestaCnt.innerHTML = options;
}

function poblarSelectProveedores(proveedores) {
  const selectCompraProv = document.getElementById('compra-proveedor');
  if (!selectCompraProv) return;

  if (selectCompraProv.tagName === 'SELECT') {
    const options = '<option value="">Seleccione Proveedor</option>' + 
      proveedores.map(p => `<option value="${p.nombre_empresa}">${p.nombre_empresa}</option>`).join('');
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
    notas
  }]);

  if (errCompra) return alert('Error al registrar la compra: ' + errCompra.message);

  await _supabase.from('movimientos').insert([{
    producto_id: prodId,
    tipo: 'ENTRADA',
    cantidad,
    concepto: `Compra Factura: ${factura} (${proveedor})`
  }]);

  await _supabase.from('productos').update({ 
    stock_actual: nuevoStock,
    costo_unitario: costoUnitario 
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
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No hay compras registradas.</td></tr>';
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
    motivo
  }]);

  if (errSalida) return alert('Error al registrar la salida: ' + errSalida.message);

  await _supabase.from('movimientos').insert([{
    producto_id: prodId,
    tipo: 'SALIDA',
    cantidad,
    concepto: `Entrega a: ${obra} (Recibe: ${solicitante})`
  }]);

  await _supabase.from('productos').update({ stock_actual: nuevoStock }).eq('id', prodId);

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
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay salidas registradas.</td></tr>';
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
  const entregado = document.getElementById('cesta-entregado').value || 'N/A';
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
    estado: 'Activa'
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
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: var(--text-muted);">No hay obras registradas.</td></tr>';
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
    notify_on_updates: document.getElementById('cnt-notify').value.trim()
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
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-muted);">No contractors registered.</td></tr>';
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
    categoria: document.getElementById('prov-categoria').value
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
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-muted);">No hay proveedores registrados.</td></tr>';
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
// 11. MOVIMIENTOS Y NAVEGACIÓN TAB
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

  await _supabase.from('movimientos').insert([{ producto_id: prodId, tipo, cantidad, concepto }]);
  await _supabase.from('productos').update({ stock_actual: nuevoStock }).eq('id', prodId);

  document.getElementById('movement-form').reset();
  cargarDatos();
}

async function renderizarMovimientos(movimientos) {
  const tbody = document.getElementById('movements-table-body');
  if (!tbody) return;
  if (movimientos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay movimientos registrados.</td></tr>';
    return;
  }
  tbody.innerHTML = movimientos.map(m => `
    <tr>
      <td>${new Date(m.fecha).toLocaleDateString()}</td>
      <td>${m.productos?.nombre || 'General'}</td>
      <td><span class="badge ${m.tipo === 'ENTRADA' ? 'badge-in' : 'badge-out'}">${m.tipo}</span></td>
      <td>${m.cantidad}</td>
      <td>${m.concepto}</td>
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
