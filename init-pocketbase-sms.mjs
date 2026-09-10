const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const SUPERUSER_EMAIL = process.env.PB_ADMIN_EMAIL || 'admin@storemanager.com';
const SUPERUSER_PASS = process.env.PB_ADMIN_PASS || 'admin123';

async function pbFetch(path, { method='GET', token, body }={}) {
  const headers={'Content-Type':'application/json'};
  if(token) headers['Authorization']=token;
  const res=await fetch(`${PB_URL}${path}`,{method,headers,body: body?JSON.stringify(body):undefined});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}
async function authSuperuser(){
  for(const ep of ['/api/collections/_superusers/auth-with-password','/api/admins/auth-with-password']){
    try{
      const data=await pbFetch(ep,{method:'POST',body:{identity:SUPERUSER_EMAIL,password:SUPERUSER_PASS}});
      return data.token;
    }catch{}
  }
  throw new Error('Superuser auth failed');
}
async function main(){
  console.log(`PocketBase: ${PB_URL} superuser ${SUPERUSER_EMAIL}`);
  const token=await authSuperuser();
  const existing=await pbFetch('/api/collections',{token});
  const byName=new Map(existing.items.map(c=>[c.name,c]));
  if(byName.has('sms_logs')){
    console.log('- sms_logs already exists');
    return;
  }
  const col={
    name:'sms_logs',
    type:'base',
    listRule:'@request.auth.id != ""',
    viewRule:'@request.auth.id != ""',
    createRule:'@request.auth.id != ""',
    updateRule:'@request.auth.id != ""',
    deleteRule:'@request.auth.id != ""',
    fields:[
      {name:'bill_id',type:'text',required:false},
      {name:'bill_number',type:'text',required:false},
      {name:'customer_name',type:'text',required:false},
      {name:'phone',type:'text',required:false},
      {name:'message',type:'text',required:false},
      {name:'status',type:'select',required:false,values:['sent','failed','pending']},
      {name:'error',type:'text',required:false},
      {name:'sent_at',type:'date',required:false},
    ]
  };
  const created=await pbFetch('/api/collections',{method:'POST',token,body:col});
  console.log(`✓ Created sms_logs (${created.id})`);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
