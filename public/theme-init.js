(function () {
  var isDark = false
  try {
    var raw = localStorage.getItem("synapse-runner-v1")
    if (raw) {
      var o = JSON.parse(raw)
      if (o && o.ui && o.ui.theme === "dark") {
        isDark = true
        document.documentElement.classList.add("dark")
      } else {
        document.documentElement.classList.remove("dark")
      }
    } else {
      document.documentElement.classList.remove("dark")
    }
  } catch (e) {
    document.documentElement.classList.remove("dark")
  }
  var tc = document.querySelector('meta[name="theme-color"]')
  if (tc) tc.setAttribute("content", isDark ? "#0f1115" : "#f8fafc")
})()
