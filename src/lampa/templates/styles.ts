export const cssStyles = `
<style>
  .view--uafilms svg {
    margin-right: 0.4em;
    vertical-align: middle;
  }
  .uafilms-empty {
    padding: 3em 1.5em;
    text-align: center;
    opacity: 0.85;
  }
  .uafilms-empty__title {
    font-size: 1.5em;
    margin-bottom: 0.5em;
    font-weight: 500;
  }
  .uafilms-empty__descr {
    font-size: 1em;
    opacity: 0.7;
  }
  /* Focus state strictly scoped to online-prestige items inside our plugin */
  .online-prestige.focus {
    background-color: rgba(255, 255, 255, 0.15) !important;
    box-shadow: 0 0 0 0.2em #fff !important;
    border-radius: 0.35em !important;
  }
  .online-prestige.focus .online-prestige__title {
    color: #fff !important;
  }
  /* Fallback style for online-prestige items if not registered natively */
  .online-prestige {
    position: relative;
    border-radius: 0.3em;
    background-color: rgba(0,0,0,0.3);
    display: flex;
    will-change: transform;
    margin-bottom: 0.5em;
  }
  .online-prestige__body {
    padding: 1.1em;
    line-height: 1.3;
    flex-grow: 1;
    position: relative;
  }
  .online-prestige__img {
    position: relative;
    width: 12em;
    flex-shrink: 0;
    min-height: 7.5em;
    border-radius: 0.3em;
    overflow: hidden;
    background: rgba(255,255,255,0.05);
  }
  .online-prestige__img > img {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transition: opacity 0.3s;
  }
  .online-prestige__img--loaded > img {
    opacity: 1;
  }
  .online-prestige__episode-number {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.2em;
    font-weight: bold;
    text-shadow: 0 2px 4px rgba(0,0,0,0.8);
  }
  .online-prestige__viewed {
    position: absolute;
    top: 0.6em;
    left: 0.6em;
    background: rgba(0,0,0,0.6);
    border-radius: 50%;
    padding: 0.25em;
    font-size: 0.76em;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .online-prestige__viewed svg {
    width: 1.3em !important;
    height: 1.3em !important;
    fill: #ffd700;
  }
  .online-prestige__head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .online-prestige__title {
    font-size: 1.15em;
    font-weight: 500;
  }
  .online-prestige__time {
    font-size: 0.9em;
    opacity: 0.65;
    margin-left: 0.6em;
  }
  .online-prestige__timeline {
    margin: 0.6em 0;
  }
  .online-prestige__footer {
    display: flex;
    justify-content: space-between;
    font-size: 0.9em;
    opacity: 0.8;
  }
  .online-prestige__loader {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 1.8em;
    height: 1.8em;
    margin: -0.9em 0 0 -0.9em;
    border: 2px solid rgba(255,255,255,0.2);
    border-top-color: #fff;
    border-radius: 50%;
    animation: uafilms-spin 0.8s infinite linear;
  }
  @keyframes uafilms-spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  .online-prestige-split {
    margin: 0 0.4em;
    opacity: 0.5;
    font-size: 0.7em;
  }
  .online-prestige-rate {
    display: inline-flex;
    align-items: center;
    margin-right: 0.5em;
  }
  .online-prestige-rate svg {
    width: 0.9em;
    height: 0.9em;
    margin-right: 0.25em;
    fill: #ffd700;
  }
</style>`;
