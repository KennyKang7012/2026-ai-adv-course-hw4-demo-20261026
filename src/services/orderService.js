const { v4: uuidv4 } = require('uuid');
const db = require('../database');

function generateOrderNo() {
  // Use Taipei date so the order number matches ECPay MerchantTradeDate
  const dateStr = new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
    .replace(/-/g, '');
  const random = uuidv4().slice(0, 5).toUpperCase();
  return `ORD-${dateStr}-${random}`;
}

function serializeOrder(order) {
  return {
    ...order,
    is_remote_area: Boolean(order.is_remote_area),
    is_express: Boolean(order.is_express)
  };
}

function findOrderById(orderId) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
}

function findOrderForUser(orderId, userId) {
  return db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, userId);
}

function listOrdersForUser(userId) {
  return db.prepare(
    `SELECT id, order_no, subtotal, discount, coupon_code, shipping_fee, shipping_method,
            is_remote_area, is_express, total_amount, status, created_at
     FROM orders WHERE user_id = ? ORDER BY created_at DESC`
  ).all(userId);
}

function getOrderItems(orderId) {
  return db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
}

function getOrderItemSummaries(orderId) {
  return db.prepare(
    'SELECT product_name, product_price, quantity FROM order_items WHERE order_id = ?'
  ).all(orderId);
}

// Cart items joined with the current product price and stock
function getCheckoutItems(userId) {
  return db.prepare(
    `SELECT ci.id, ci.product_id, ci.quantity,
            p.name as product_name, p.price as product_price, p.stock as product_stock
     FROM cart_items ci
     JOIN products p ON ci.product_id = p.id
     WHERE ci.user_id = ?`
  ).all(userId);
}

function findInsufficientItems(cartItems) {
  return cartItems.filter(item => item.quantity > item.product_stock);
}

const MAX_ORDER_NO_ATTEMPTS = 5;

class StockInsufficientError extends Error {
  constructor(productName) {
    super(`庫存不足：${productName}`);
    this.name = 'StockInsufficientError';
    this.code = 'STOCK_INSUFFICIENT';
    this.productName = productName;
  }
}

function isOrderNoCollision(err) {
  return err.code === 'SQLITE_CONSTRAINT_UNIQUE' && String(err.message).includes('order_no');
}

/**
 * Create an order from the member's cart in one transaction:
 * insert order → snapshot items → deduct stock → clear cart.
 * Amounts must already be calculated by the caller.
 *
 * Stock is deducted with a `stock >= ?` guard inside the transaction, so two
 * processes cannot both pass the earlier pre-check and oversell.
 */
function createOrderFromCart({ userId, recipient, delivery, cartItems, subtotal, discount = 0, couponCode = null, shipping }) {
  const orderId = uuidv4();

  const insertOrder = db.prepare(
    `INSERT INTO orders (
       id, order_no, user_id, recipient_name, recipient_email, recipient_address,
       subtotal, shipping_fee, shipping_method, is_remote_area, is_express,
       total_amount, coupon_code, discount, merchant_trade_no
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertItem = db.prepare(
    `INSERT INTO order_items (id, order_id, product_id, product_name, product_price, quantity)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const updateStock = db.prepare(
    'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?'
  );
  const clearCart = db.prepare('DELETE FROM cart_items WHERE user_id = ?');

  const createWithOrderNo = db.transaction((orderNo) => {
    insertOrder.run(
      orderId,
      orderNo,
      userId,
      recipient.name,
      recipient.email,
      recipient.address,
      subtotal,
      shipping.shippingFee,
      delivery.method,
      delivery.isRemoteArea ? 1 : 0,
      delivery.isExpress ? 1 : 0,
      shipping.totalAmount,
      couponCode,
      discount,
      orderNo.replace(/-/g, '')
    );

    for (const item of cartItems) {
      insertItem.run(uuidv4(), orderId, item.product_id, item.product_name, item.product_price, item.quantity);
      const result = updateStock.run(item.quantity, item.product_id, item.quantity);
      if (result.changes === 0) {
        throw new StockInsufficientError(item.product_name);
      }
    }

    clearCart.run(userId);
  });

  // order_no is UNIQUE; retry with a fresh number on a collision instead of failing the request
  for (let attempt = 0; attempt < MAX_ORDER_NO_ATTEMPTS; attempt++) {
    try {
      createWithOrderNo(generateOrderNo());
      return orderId;
    } catch (err) {
      const isLastAttempt = attempt === MAX_ORDER_NO_ATTEMPTS - 1;
      if (!isOrderNoCollision(err) || isLastAttempt) throw err;
    }
  }
}

module.exports = {
  generateOrderNo,
  StockInsufficientError,
  serializeOrder,
  findOrderById,
  findOrderForUser,
  listOrdersForUser,
  getOrderItems,
  getOrderItemSummaries,
  getCheckoutItems,
  findInsufficientItems,
  createOrderFromCart
};
