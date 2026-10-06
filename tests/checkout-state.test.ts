import test from 'node:test'
import assert from 'node:assert/strict'
import {parsePendingQpay,checkoutStepForOpen,viewAfterPayment} from '../src/lib/checkout.ts'
const pending={orderId:'11111111-1111-4111-8111-111111111111',checkoutToken:'22222222-2222-4222-8222-222222222222',total:45000,data:{qr_image:'test',urls:[{name:'bank',link:'https://bank.example'}]}}
test('adding new items starts the cart even if an earlier payment is saved',()=>{
 assert.equal(checkoutStepForOpen(true,pending),'cart')
 assert.equal(checkoutStepForOpen(false,pending),'qpay')
 assert.equal(checkoutStepForOpen(false,null),'cart')
 assert.equal(checkoutStepForOpen(true,null),'cart')
})
test('paid verification completes only the matching QPay view, never a new cart or checkout',()=>{
 assert.equal(viewAfterPayment('qpay','old','old'),'paid')
 for(const step of ['cart','checkout','done','paid'] as const) assert.equal(viewAfterPayment(step,'old','old'),step)
 assert.equal(viewAfterPayment('qpay','old','new'),'qpay')
 assert.equal(viewAfterPayment('qpay','old',undefined),'qpay')
})
test('legacy pending invoices remain resumable while invalid local records are rejected',()=>{
 assert.deepEqual(parsePendingQpay(pending),pending)
 for(const value of [null,'text',{}, {...pending,total:0},{...pending,total:NaN},{...pending,orderId:'invalid'},{...pending,data:[]},{...pending,data:{urls:[{}]}}]) assert.equal(parsePendingQpay(value),null)
})
