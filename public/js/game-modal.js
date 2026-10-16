(() => {
  'use strict';
  if (!window.SC) return;
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  let activeSlug = '';
  let activeGame = null;
  let currentRating = 0;
  let originalOverflow = '';
  const host = document.createElement('div');
  host.id = 'gameModal'; host.className = 'modal-backdrop hidden game-modal-backdrop'; host.setAttribute('role','presentation');
  host.innerHTML = `<section class="game-modal-card" role="dialog" aria-modal="true" aria-labelledby="modalGameTitle"><button class="game-modal-close" type="button" aria-label="Close" data-modal-close><span class="visually-hidden">Close</span></button><div class="game-modal-content"><p class="muted small modal-status">SUPER CUBE GAMES</p><h2 id="modalGameTitle"></h2><div class="modal-hero-media"><img id="modalCapsule" alt=""><div class="modal-game-meta" id="modalGameMeta"></div></div><div class="modal-main-actions"><a id="modalPlay" class="button green-button" href="#">Play</a><button id="modalShare" class="button secondary" type="button">Share game ↗</button></div><p class="modal-game-description" id="modalGameDescription"></p><div class="tag-list" id="modalGameTags"></div><div class="modal-gallery" id="modalGallery"></div><div class="modal-rating-row"><div><div class="small muted" data-i18n="rateThis">Оценка игры</div><div class="modal-stars" id="modalStars" role="group" aria-label="Rate game"><button type="button" data-rate="1" aria-label="1 star">★</button><button type="button" data-rate="2" aria-label="2 stars">★</button><button type="button" data-rate="3" aria-label="3 stars">★</button><button type="button" data-rate="4" aria-label="4 stars">★</button><button type="button" data-rate="5" aria-label="5 stars">★</button><span id="modalRatingValue"></span></div></div><button id="modalFavorite" class="secondary-button" type="button">♡ Favorite</button></div><section class="modal-reviews"><div class="section-head"><h3 data-i18n="reviews">Отзывы</h3><span class="small muted" id="modalReviewCount"></span></div><p id="modalLoginHint" class="muted small"></p><form id="modalReviewForm"><textarea id="modalReviewBody" name="body" maxlength="2000" minlength="3" required placeholder="Write a review…"></textarea><div class="review-form-footer"><span class="small muted">3–2000</span><button class="button" type="submit" data-i18n="publishReview">Опубликовать</button></div></form><div id="modalReviewsList" class="modal-reviews-list"></div></section></div></section>`;
  host.querySelector('.modal-main-actions').after(host.querySelector('.modal-rating-row'));
  const favoriteControl = host.querySelector('#modalFavorite');
  favoriteControl.className = 'button favorite-cta';
  const renderFavoriteControl = () => {
    const active = favoriteControl.classList.contains('is-active');
    const label = window.SC.t(active ? 'unfavorite' : 'favorite');
    const icon = active ? '♥' : '♡';
    const desired = `${icon} ${label}`;
    if (favoriteControl.textContent !== desired) favoriteControl.textContent = desired;
  };
  new MutationObserver(renderFavoriteControl).observe(favoriteControl, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('sc:language', renderFavoriteControl);
  renderFavoriteControl();
  document.body.appendChild(host);
  const el = (id) => document.getElementById(id);
  const backdrop = host;
  const stars = [...host.querySelectorAll('[data-rate]')];

  function animateStars(target, rating) {
    target.classList.remove('star-pop'); void target.offsetWidth; target.classList.add('star-pop');
    const rect = target.getBoundingClientRect();
    for (let i=0;i<Math.min(14, rating * 2 + 4);i++) {
      const bit=document.createElement('span'); bit.className='star-spark'; bit.textContent=i%3===0?'✦':'★';
      bit.style.left=`${rect.left+rect.width/2}px`; bit.style.top=`${rect.top+rect.height/2}px`;
      bit.style.setProperty('--dx',`${(Math.random()-.5)*100}px`); bit.style.setProperty('--dy',`${-20-Math.random()*85}px`);
      document.body.appendChild(bit); setTimeout(()=>bit.remove(),850);
    }
  }
  function celebrateFavorite(target) {
    const symbols = ['🎉','😊','❤️','👏','🎲','🎮','✨','💖'];
    const rect = target?.getBoundingClientRect?.() || { left: innerWidth/2, top: innerHeight/2, width: 0, height: 0 };
    const particles = [];
    const count = 24;
    const originX = rect.left + rect.width / 2, originY = rect.top + rect.height / 2;
    for (let i=0;i<count;i++) {
      const node=document.createElement('span'); node.className=i%3===0?'favorite-particle confetti-particle':'favorite-particle';
      node.textContent=symbols[Math.floor(Math.random()*symbols.length)];
      const size=14+Math.random()*18;
      node.style.setProperty('--size',`${size}px`);
      node.style.left=`${originX}px`; node.style.top=`${originY}px`;
      node.style.fontSize=`${size}px`;
      document.body.appendChild(node);
      const angle=(-Math.PI*0.92)+(Math.random()*Math.PI*0.84);
      const speed=95+Math.random()*210;
      particles.push({node,x:originX,y:originY,vx:Math.cos(angle)*speed+(Math.random()-.5)*65,vy:-(75+Math.random()*185),rotation:Math.random()*60-30,spin:(Math.random()-.5)*520,life:0,duration:1850+Math.random()*150,size});
    }
    let last=performance.now();
    function frame(now) {
      const dt=Math.min(.04,(now-last)/1000); last=now;
      let alive=false;
      for(const p of particles){
        if(p.life>=p.duration){p.node.remove();continue;}
        alive=true; p.life+=dt*1000;
        // Light gravity and air resistance give the burst a soft, physical fall.
        p.vy+=390*dt; p.vx*=Math.pow(.985,dt*60); p.vy*=Math.pow(.997,dt*60);
        p.x+=p.vx*dt; p.y+=p.vy*dt; p.rotation+=p.spin*dt;
        const progress=Math.min(1,p.life/p.duration), opacity=progress<.58?1:1-(progress-.58)/.42;
        const scale=1-progress*.88;
        p.node.style.transform=`translate3d(${p.x-originX}px,${p.y-originY}px,0) rotate(${p.rotation}deg) scale(${scale})`;
        p.node.style.opacity=String(Math.max(0,opacity));
      }
      if(alive)requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function setRatingVisual(value) {
    const visualRating = Number(value) || 0;
    stars.forEach((button) => {
      const on = Number(button.dataset.rate) <= visualRating;
      button.classList.toggle('is-filled', on);
      button.setAttribute('aria-pressed', String(Number(button.dataset.rate) === visualRating));
    });
  }
  function renderReviews(reviews) {
    const list=el('modalReviewsList');
    const roots=(reviews||[]).filter((item)=>!item.parentId);
    el('modalReviewCount').textContent=String(roots.length);
    if (!roots.length) { list.innerHTML=`<p class="muted small">${safe(window.SC.t('noReviews'))}</p>`; return; }
    list.innerHTML=roots.map((review)=>{
      const replies=(reviews||[]).filter((item)=>Number(item.parentId)===Number(review.id));
      const avatar=review.avatar?`<img class="review-avatar" src="${safe(review.avatar)}" alt="">`:'<span class="review-avatar review-avatar-empty">●</span>';
      const tools=[review.canEdit?`<button type="button" data-edit-review="${review.id}">${safe(window.SC.t('edit'))}</button>`:'',review.canDelete?`<button type="button" data-delete-review="${review.id}">${safe(window.SC.t('delete'))}</button>`:'',window.SC.bootstrap?.user?.isAdmin?`<button type="button" data-reply-review="${review.id}">${safe(window.SC.t('reply'))}</button>`:''].filter(Boolean).join('');
      return `<article class="modal-review" data-review-id="${review.id}"><div class="review-heading">${avatar}<div><strong>${safe(review.name||review.playerId||'Player')}</strong><div class="small muted">${new Date(review.createdAt).toLocaleDateString(window.SC.language==='ru'?'ru-RU':'en-US')}${review.updatedAt!==review.createdAt?' · edited':''}</div></div><div class="review-tools">${tools}</div></div><p class="review-body">${safe(review.body)}</p>${replies.map((reply)=>`<div class="modal-review-reply"><strong>${safe(reply.name||'SUPER CUBE')} · ${safe(window.SC.t('adminReply'))}</strong><p>${safe(reply.body)}</p>${reply.canDelete?`<button type="button" data-delete-review="${reply.id}">${safe(window.SC.t('delete'))}</button>`:''}</div>`).join('')}</article>`;
    }).join('');
    list.querySelectorAll('[data-edit-review]').forEach((button)=>button.addEventListener('click',async()=>{
      const review=roots.find((r)=>r.id===Number(button.dataset.editReview)); if(!review)return;
      const body=prompt(window.SC.language==='ru'?'Измени комментарий':'Edit your comment',review.body); if(body===null)return;
      try { const data=await window.SC.api(`/api/games/${encodeURIComponent(activeSlug)}/reviews/${review.id}`,{method:'PATCH',body:{body}}); renderReviews(data.reviews); window.SC.toast(window.SC.language==='ru'?'Комментарий обновлён':'Comment updated'); }
      catch(error){window.SC.toast(error.message,true);}
    }));
    list.querySelectorAll('[data-delete-review]').forEach((button)=>button.addEventListener('click',async()=>{
      if(!confirm(window.SC.language==='ru'?'Удалить комментарий?':'Delete this comment?'))return;
      try { const data=await window.SC.api(`/api/games/${encodeURIComponent(activeSlug)}/reviews/${button.dataset.deleteReview}`,{method:'DELETE'}); renderReviews(data.reviews); }
      catch(error){window.SC.toast(error.message,true);}
    }));
    list.querySelectorAll('[data-reply-review]').forEach((button)=>button.addEventListener('click',async()=>{
      const body=prompt(window.SC.language==='ru'?'Ответ от имени администратора':'Reply as administrator'); if(body===null)return;
      try { const data=await window.SC.api(`/api/games/${encodeURIComponent(activeSlug)}/reviews/${button.dataset.replyReview}/reply`,{method:'POST',body:{body}}); renderReviews(data.reviews); }
      catch(error){window.SC.toast(error.message,true);}
    }));
  }
  async function loadReviews() {
    try { const data=await window.SC.api(`/api/games/${encodeURIComponent(activeSlug)}/reviews`); renderReviews(data.reviews||[]); }
    catch { el('modalReviewsList').innerHTML=`<p class="muted small">${safe(window.SC.t('noReviews'))}</p>`; }
  }
  async function updateModalPing(slug) {
    const node=host.querySelector('[data-modal-ping]'); if(!node)return;
    for(let attempt=0;attempt<5;attempt++){
      try { const result=await window.SC.api(`/api/games/${encodeURIComponent(slug)}/ping`); if(result.status==='online'){node.textContent=`${window.SC.language==='ru'?'Пинг':'Ping'}: ${result.pingMs} ms`;return;} node.textContent=window.SC.t('pingStarting'); }
      catch(error){ node.textContent=window.SC.t('pingOffline'); return; }
      await new Promise(resolve=>setTimeout(resolve,800));
    }
    node.textContent=window.SC.t('pingOffline');
  }
  async function openGameModal(slug) {
    activeSlug=slug; currentRating=0; activeGame=null;
    backdrop.classList.remove('hidden'); originalOverflow=document.body.style.overflow; document.body.style.overflow='hidden';
    el('modalGameTitle').textContent=slug; el('modalReviewBody').placeholder=window.SC.t('writeReview'); el('modalGameDescription').textContent=''; el('modalGallery').innerHTML=''; el('modalReviewsList').innerHTML='<div class="loading-line"></div>';
    try {
      const data=await window.SC.api(`/api/games/${encodeURIComponent(slug)}/details?lang=${window.SC.language}`);
      activeGame=data.game;
      el('modalGameTitle').textContent=activeGame.title;
      el('modalCapsule').src=activeGame.capsule; el('modalCapsule').alt=activeGame.title;
      el('modalGameDescription').textContent=activeGame.description||'';
      el('modalGameMeta').innerHTML=`<span>${safe(window.SC.formatPlayers(activeGame.minPlayers,activeGame.maxPlayers))}</span><span>${safe(activeGame.runtimeType==='server'?'Server runtime':'Browser game')}</span><span>${safe(Number(activeGame.averageRating||0).toFixed(1))} ★ · ${safe(activeGame.ratingsCount||0)}</span>${activeGame.runtimeType==='server'?`<span data-modal-ping>${safe(window.SC.t('pingChecking'))}</span>`:''}`;
      if(activeGame.runtimeType==='server') updateModalPing(slug);
      el('modalGameTags').innerHTML=(activeGame.tags||[]).map((tag)=>`<span class="tag">${safe(String(tag).toLowerCase())}</span>`).join('');
      const shots=(activeGame.screenshots||[]).map((src)=>({src,alt:window.SC.t('gameScreenshots')}));
      const promo=(activeGame.promo||[]).slice(0,6).map((src)=>({src,alt:activeGame.title}));
      const galleryItems=[...shots,...promo];
      el('modalGallery').innerHTML=galleryItems.length?`<h3>${safe(window.SC.t('gameScreenshots'))}</h3><div class="modal-gallery-grid">${galleryItems.map((image)=>`<img src="${safe(image.src)}" alt="${safe(image.alt)}" loading="lazy">`).join('')}</div>`:'';
      currentRating=Number(data.ownRating||0); setRatingVisual(currentRating);
      el('modalRatingValue').textContent=`${Number(activeGame.averageRating||0).toFixed(1)} / 5`;
      el('modalFavorite').textContent=data.isFavorite?'♥ Favorited':'♡ Favorite'; el('modalFavorite').classList.toggle('is-active',data.isFavorite);
      const draft=activeGame.status==='draft';
      el('modalPlay').href=draft?`/games/${encodeURIComponent(slug)}-test`:`/games/${encodeURIComponent(slug)}?src=catalog`;
      el('modalPlay').textContent=window.SC.t('play');
      el('modalPlay').onclick=async()=>{ if(!draft){window.SC.api('/api/events',{method:'POST',body:{slug,type:'catalog_click',guestId:window.SC.getGuestId()}}).catch(()=>{});} };
      el('modalFavorite').disabled=draft;
      el('modalShare').disabled=draft;
      el('modalLoginHint').textContent=window.SC.bootstrap?.user?'':window.SC.t('signInToReview');
      el('modalReviewForm').hidden=draft;
      if(!draft) await loadReviews(); else el('modalReviewsList').innerHTML='<p class="muted small">Private draft preview</p>';
      // Draft preview is available for admins but does not expose public interactions.
    } catch(error) { el('modalGameTitle').textContent=window.SC.language==='ru'?'Не удалось загрузить игру':'Could not load game'; window.SC.toast(error.message,true); }
  }
  function closeModal() { backdrop.classList.add('hidden'); document.body.style.overflow=originalOverflow; activeSlug=''; activeGame=null; }
  host.querySelector('[data-modal-close]').addEventListener('click',closeModal);
  backdrop.addEventListener('click',(event)=>{if(event.target===backdrop)closeModal();});
  document.addEventListener('keydown',(event)=>{if(event.key==='Escape'&&!backdrop.classList.contains('hidden'))closeModal();});
  const starsGroup = el('modalStars');
  starsGroup.addEventListener('pointerover', (event) => { const button = event.target.closest('[data-rate]'); if (button && starsGroup.contains(button)) setRatingVisual(Number(button.dataset.rate)); });
  starsGroup.addEventListener('pointerleave', () => setRatingVisual(currentRating));
  starsGroup.addEventListener('focusin', (event) => { const button = event.target.closest('[data-rate]'); if (button) setRatingVisual(Number(button.dataset.rate)); });
  starsGroup.addEventListener('focusout', (event) => { if (!starsGroup.contains(event.relatedTarget)) setRatingVisual(currentRating); });
  stars.forEach((button)=>{
    button.addEventListener('click',async()=>{
      if(!window.SC.bootstrap?.user){location.href='/login.html';return;}
      const value=Number(button.dataset.rate);
      try { const saved=await window.SC.api(`/api/games/${encodeURIComponent(activeSlug)}/rating`,{method:'POST',body:{rating:value}}); currentRating=value; setRatingVisual(currentRating); animateStars(button,value); const m=saved.metrics||{}; if(activeGame){activeGame.averageRating=Number(m.averageRating||0);activeGame.ratingsCount=Number(m.ratingsCount||0);} el('modalRatingValue').textContent=`${Number(m.averageRating||0).toFixed(1)} / 5`; const meta=el('modalGameMeta'); const spans=[...meta.querySelectorAll('span')]; if(spans[2])spans[2].textContent=`${Number(m.averageRating||0).toFixed(1)} ★ · ${Number(m.ratingsCount||0)}`; window.SC.updateCatalogRating?.(activeSlug,m.averageRating,m.ratingsCount); window.SC.toast(window.SC.t('ratingSaved')); }
      catch(error){setRatingVisual(currentRating);window.SC.toast(error.message,true);}
    });
  });
  el('modalFavorite').addEventListener('click',async()=>{
    if(!window.SC.bootstrap?.user){location.href='/login.html';return;}
    try { const result=await window.SC.api(`/api/games/${encodeURIComponent(activeSlug)}/favorite`,{method:'POST',body:{}}); el('modalFavorite').textContent=result.favorite?'♥ Favorited':'♡ Favorite'; el('modalFavorite').classList.toggle('is-active',result.favorite); if(result.favorite){celebrateFavorite(el('modalFavorite'));window.SC.toast(window.SC.t('favoriteAdded'));}else{window.SC.toast(window.SC.t('favoriteRemoved'));} }
    catch(error){window.SC.toast(error.message,true);}
  });
  el('modalShare').addEventListener('click',async()=>{
    if(!activeGame)return;
    try {
      const result=await window.SC.api(`/api/games/${encodeURIComponent(activeSlug)}/share`,{method:'POST',body:{guestId:window.SC.getGuestId()}});
      if(navigator.share){try{await navigator.share({title:activeGame.title,text:activeGame.description||activeGame.title,url:result.url});}catch(error){if(error.name==='AbortError')return;await navigator.clipboard.writeText(result.url);window.SC.toast(window.SC.t('shareCopied'));}}
      else {await navigator.clipboard.writeText(result.url);window.SC.toast(window.SC.t('shareCopied'));}
    } catch(error){window.SC.toast(error.message,true);}
  });
  el('modalReviewForm').addEventListener('submit',async(event)=>{
    event.preventDefault();
    const form=event.currentTarget; // Capture the form before await; event.currentTarget is not stable after async turns.
    if(!window.SC.bootstrap?.user){location.href='/login.html';return;}
    const body=el('modalReviewBody').value.trim();
    try { const data=await window.SC.api(`/api/games/${encodeURIComponent(activeSlug)}/review`,{method:'POST',body:{body}}); form.reset(); renderReviews(data.reviews||[]); window.SC.toast(window.SC.t('reviewSaved')); }
    catch(error){window.SC.toast(error.message,true);}
  });
  window.SC.openGameModal=openGameModal;
  window.SC.celebrateFavorite=celebrateFavorite;
  window.addEventListener('sc:language',()=>{ if(activeSlug&&!backdrop.classList.contains('hidden')) openGameModal(activeSlug); });
})();
