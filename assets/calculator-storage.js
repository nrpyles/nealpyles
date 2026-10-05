/* Keep calculators usable when Safari private mode or browser settings block persistence. */
window.safeStorage={getItem(key){try{return window.localStorage.getItem(key)}catch{return null}},setItem(key,value){try{window.localStorage.setItem(key,value)}catch{}},removeItem(key){try{window.localStorage.removeItem(key)}catch{}}};
