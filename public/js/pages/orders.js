const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const orders = ref([]);
    const pagination = ref(null);
    const loading = ref(true);

    const statusMap = {
      pending: { label: '待付款', cls: 'bg-apricot/20 text-apricot' },
      paid: { label: '已付款', cls: 'bg-sage/20 text-sage' },
      failed: { label: '付款失敗', cls: 'bg-red-100 text-red-600' },
    };

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/orders');
        orders.value = res.data.orders;
        pagination.value = res.data.pagination || null;
      } catch (e) {
        orders.value = [];
        pagination.value = null;
      } finally {
        loading.value = false;
      }
    });

    return { orders, pagination, loading, statusMap, formatDate };
  }
}).mount('#app');
