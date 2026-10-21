import {Router,Request,Response} from 'express';
import {authMiddleware,actorIdOf} from '../auth/auth.middleware';
import {sharedAccountReadAccess} from '../team/account-read-access';
import {DeliveryError} from './delivery-profile';
import {logger} from '../shared/logger';
import {deliveryOrder,viewDelivery,queueDelivery,processDeliveryQueue,fileForOrder,sendOrderDelivery,completeDelivery,markDeliveredManually} from './delivery.service';
const router=Router();router.use(authMiddleware);router.use(sharedAccountReadAccess('tracking'));
const route='/sources/:id/orders/:orderId/delivery';
function handle(fn:(req:Request,res:Response)=>Promise<any>){return async(req:Request,res:Response)=>{try{await fn(req,res);}catch(e:any){if(!(e instanceof DeliveryError))logger.error('delivery request failed',{error:e?.code||e?.name||'internal'});res.status(e instanceof DeliveryError?e.status:500).json({success:false,error:{message:e instanceof DeliveryError?e.message:'Não foi possível processar a entrega.'}});}};}
const order=(req:Request)=>deliveryOrder(req.params.id,req.params.orderId,req.user!.userId);
router.get(route,handle(async(req,res)=>{res.setHeader('Cache-Control','no-store');res.json({success:true,data:await viewDelivery(await order(req))});}));
router.post(route+'/generate',handle(async(req,res)=>{
 const o=await order(req);const childName=typeof req.body?.childName==='string'?req.body.childName:undefined;const setting=typeof req.body?.setting==='string'?req.body.setting:undefined;await queueDelivery(o,actorIdOf(req),req.body?.regenerate===true,childName,setting);
 setImmediate(()=>void processDeliveryQueue());res.status(202).json({success:true,data:await viewDelivery(o)});
}));
router.get(route+'/files/:kind',handle(async(req,res)=>{
 const file=await fileForOrder(await order(req),req.params.kind);res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${req.params.kind}.pdf"`);res.send(file.bytes);
}));
router.post(route+'/send',handle(async(req,res)=>{
 const message=typeof req.body?.message==='string'?req.body.message.trim():'';
 if(!message||message.length>2000)throw new DeliveryError('Confira a mensagem (até 2.000 caracteres).',400);
 const o=await order(req);await sendOrderDelivery(o,actorIdOf(req),message);res.json({success:true,data:await viewDelivery(o)});
}));
router.post(route+'/complete',handle(async(req,res)=>{
 if(req.body?.confirmed!==true)throw new DeliveryError('Confirme que todos os arquivos foram entregues antes de apagá-los.',400);
 const o=await order(req);await completeDelivery(o,actorIdOf(req));res.json({success:true,data:await viewDelivery(o)});
}));
router.post(route+'/complete-manual',handle(async(req,res)=>{
 if(req.body?.confirmed!==true)throw new DeliveryError('Confirme que o cliente já recebeu a entrega.',400);
 const o=await order(req);await markDeliveredManually(o,actorIdOf(req));res.json({success:true,data:await viewDelivery(o)});
}));
export const deliveryController=router;
