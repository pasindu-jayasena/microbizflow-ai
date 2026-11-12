import { expect,test } from '@playwright/test';

test('owner assistant answers safely and requires a decision on a proposed price',async({page,request})=>{
  test.skip(!process.env.LOCAL_OWNER_PASSWORD,'A disposable local owner credential is required');
  expect((await request.get('/api/owner/assistant/history')).status()).toBe(401);
  const catalogue=await request.get('/api/business').then(response=>response.json());
  const service=catalogue.services.find((item:{id:string})=>item.id==='svc_cut');
  expect(service).toBeTruthy();
  await page.goto('/owner');
  await page.getByLabel('Password').fill(process.env.LOCAL_OWNER_PASSWORD!);
  await page.getByRole('button',{name:'Sign in'}).click();
  const assistant=page.getByRole('heading',{name:'Ask about your studio. Review every proposed change.'}).locator('..').locator('..');
  await assistant.getByRole('button',{name:'How many pending appointments?'}).click();
  await expect(assistant.getByText(/appointments are awaiting owner approval/)).toBeVisible();
  const price=(service.priceMinor??service.price_minor)/100;
  await assistant.getByLabel('Your request').fill(`Set ${service.name} price to LKR ${price+100}`);
  await assistant.getByRole('button',{name:'Ask assistant'}).click();
  await expect(assistant.getByText(/Owner approval is required/)).toBeVisible();
  await expect(assistant.getByRole('button',{name:'Reject'}).first()).toBeVisible();
  await assistant.getByRole('button',{name:'Reject'}).first().click();
  await expect(assistant.getByText('Price change rejected.')).toBeVisible();
  const after=await request.get('/api/business').then(response=>response.json());
  expect(after.services.find((item:{id:string})=>item.id===service.id)?.priceMinor??after.services.find((item:{id:string})=>item.id===service.id)?.price_minor).toBe(service.priceMinor??service.price_minor);
});
