export const itemTemplate = `
<div class="online-prestige online-prestige--full selector">
  <div class="online-prestige__img">
    <img alt="">
    <div class="online-prestige__loader"></div>
  </div>
  <div class="online-prestige__body">
    <div class="online-prestige__head">
      <div class="online-prestige__title">{title}</div>
      <div class="online-prestige__time">{time}</div>
    </div>
    <div class="online-prestige__timeline"></div>
    <div class="online-prestige__footer">
      <div class="online-prestige__info">{info}</div>
      <div class="online-prestige__quality">{quality}</div>
    </div>
  </div>
</div>`;

export const movieItemTemplate = `
<div class="online selector">
  <div class="online__body">
    <div style="position: absolute; left: 0; top: -0.3em; width: 2.4em; height: 2.4em;">
      <svg style="height: 2.4em; width: 2.4em;" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="64" cy="64" r="56" stroke="white" stroke-width="14"/>
        <path d="M90.5 64.38L50 87.76V41L90.5 64.38Z" fill="white"/>
      </svg>
    </div>
    <div class="online__title" style="padding-left: 2.3em;">{title}</div>
    <div class="online__quality" style="padding-left: 3.5em;">{quality}{info}</div>
  </div>
</div>`;

export const emptyTemplate = `
<div class="uafilms-empty">
  <div class="uafilms-empty__title">#{uafilms_not_found}</div>
  <div class="uafilms-empty__descr">{details}</div>
</div>`;

export const cardButtonHtml = `
<div class="full-start__button selector view--uafilms" data-subtitle="UAFilms">
  <svg width="20" height="20" viewBox="0 0 31 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M0.557816 9.24832L29.4367 0.035822C30.033 -0.154392 30.6108 0.380053 30.4678 0.989283L23.505 30.6436C23.3493 31.3074 22.4888 31.4853 22.0783 30.9384L13.0188 18.8739C12.961 18.7969 12.89 18.7308 12.809 18.6788L0.371912 10.6918C-0.201881 10.3233 -0.0899653 9.45505 0.557816 9.24832Z" fill="currentColor"/>
  </svg>
  <span>#{title_online}</span>
</div>`;
