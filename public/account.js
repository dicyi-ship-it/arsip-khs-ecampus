const info=await fetch('/api/auth/status').then(r=>r.json());
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
if(!info.user)location.replace('/login');
const header=document.querySelector('header');
if(info.user&&header){const nav=document.createElement('nav');nav.className='account-nav';const name=document.createElement('span');name.textContent=info.user.name+' · '+(info.user.role==='superadmin'?'Super admin':'Pengguna');nav.append(name);
if(info.user.role==='superadmin'){const link=document.createElement('a');link.href='/users';link.textContent='Kelola pengguna';nav.append(link);}const logout=document.createElement('button');logout.textContent='Logout';logout.onclick=async()=>{logout.disabled=true;try{await post('/api/auth/logout',{});location.replace('/login');}catch(e){logout.disabled=false;alert(e.message);}};nav.append(logout);header.append(nav);}
async function post(url,body){const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':info.csrf},body:JSON.stringify(body)});const data=await response.json();if(response.status===401)location.replace('/login');if(!response.ok)throw new Error(data.error);return data;}
const form=document.getElementById('userForm');
if(form&&info.user){
  async function loadUsers(){const response=await fetch('/api/users');const data=await response.json();if(!response.ok)throw new Error(data.error);const body=document.getElementById('userRows');body.replaceChildren();for(const user of data.users){const row=document.createElement('tr');for(const value of [user.username,user.name,user.role==='superadmin'?'Super admin':'Pengguna']){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}body.append(row);}}
  try{await loadUsers();}catch(e){document.getElementById('userMessage').textContent=e.message;}
  form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;try{await post('/api/users',Object.fromEntries(new FormData(form)));form.reset();document.getElementById('userMessage').textContent='Pengguna berhasil ditambahkan.';await loadUsers();}catch(e){document.getElementById('userMessage').textContent=e.message;}finally{button.disabled=false;}};
}
