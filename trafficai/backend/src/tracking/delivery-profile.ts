export class DeliveryError extends Error {
    constructor(message:string,public status=409){super(message);}
}
const normalize=(value:unknown)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function deliveryProfile(answers:any, nameOverride?:unknown, coloringOnly=false, settingOverride?:unknown) {
    const name=String(nameOverride??answers.name??answers.nome??'').trim();
    if(!name||name.length>40||/[\r\n\x00-\x1f]/.test(name))throw new DeliveryError('Confira o nome da criança nas respostas do quiz (até 40 caracteres).');
    const gender=normalize(answers.gender);
    const moral=normalize(answers.moral);
    const setting=normalize(settingOverride??answers.setting);
    const genders:Record<string,string>={menino:'menino',masculino:'menino',boy:'menino',menina:'menina',feminino:'menina',girl:'menina'};
    const morals:Record<string,string>={amizade:'amizade',fe:'fe',obediencia:'obediencia'};
    const settings:Record<string,string>={floresta:'floresta','floresta encantada':'floresta',reino:'reino','reino encantado':'reino','reino encantada':'reino',fazendinha:'fazendinha','fundo do mar':'fundo-do-mar','fundo-do-mar':'fundo-do-mar'};
    if(!genders[gender])throw new DeliveryError('Falta identificar se a criança é menino ou menina nas respostas do quiz.');
    if(!coloringOnly&&!morals[moral])throw new DeliveryError('Falta um ensinamento válido nas respostas do quiz.');
    if(!coloringOnly&&!setting)throw new DeliveryError('Faltam respostas válidas de menino/menina, ensinamento ou cenário. Complete o quiz antes de gerar.');
    if(!coloringOnly&&!settings[setting])throw new DeliveryError(`O cenário “${String(answers.setting).slice(0,80)}” ainda não tem template de entrega. As respostas estão salvas; é necessário cadastrar esse cenário.`);
    const field=(...keys:string[])=>{
        for(const key of keys){const value=answers?.[key];if(typeof value==='string'&&value.trim())return value.trim().replace(/[\r\n\x00-\x1f]/g,' ').slice(0,180);}
        return undefined;
    };
    const shortName=(value:unknown)=>typeof value==='string'?value.trim().replace(/[\r\n\x00-\x1f]/g,' ').slice(0,50):undefined;
    return {
        name,gender:genders[gender],moral:morals[moral],setting:settings[setting],
        age:field('age','idade'),skin:field('skin','tomPele','tom_de_pele'),
        hairColor:field('hairColor','hair_color','corCabelo','cor_cabelo'),
        hairType:field('hairType','hair_type','tipoCabelo','tipo_cabelo'),
        eyes:field('eyes','eyeColor','corOlhos','cor_olhos'),
        special:field('special','personality','personalidade','temperament','temperamento'),
        temperament:field('temperament','temperamento'),
        preference:field('preference','preferencia','preferência'),
        dedicationName:shortName(field('momName','dedicationName','nomeDedicatória','nomeDedicacao')),
    };
}
export function purchasedExtras(order:any,settings:any) {
    const items=[...(Array.isArray(order.raw?.order_bumps)?order.raw.order_bumps:[]),...(Array.isArray(order.raw?.items)?order.raw.items:[])];
    const ids=[String(order.product_id||''),...items.map((x:any)=>String(x.product_id||''))].filter(Boolean);
    return {coloring:settings.coloring_product_ids.some((id:string)=>ids.includes(id)),priority:settings.priority_product_ids.some((id:string)=>ids.includes(id))};
}
