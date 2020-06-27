const elementMap = new Map()

const toggleShow = (name,tf)=>{
      elementMap.get(name).forEach(elems=>elems.className = (tf)?'':'d-none')
}

const makeCheckbox = name=>{
      const element = document.createElement('div')
      document.getElementById('foundation').appendChild(element)
      const checkbox = document.createElement('input')
      checkbox.checked = true
      checkbox.type = 'checkbox'
      checkbox.onclick = ()=>toggleShow(name,checkbox.checked)
      element.appendChild(checkbox)
      const span = document.createElement('span')
      span.innerHTML = ' '+ name
      element.appendChild(span)
}

window.onload = ()=>{
      const nonProfits = document.getElementsByClassName('foundationName')
      if(!nonProfits.length) return
      const name=Array.from(new Set(Array.from(nonProfits).map(e=>e.innerHTML)))
      name.forEach(makeCheckbox)  
      name.forEach(name=>elementMap.set(name,Array.from(document.getElementsByClassName('foundationName')).filter(e=>e.innerHTML===name).map(e=>e.parentElement))) 
}