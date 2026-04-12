(function () {
  "use strict";

  function isViewerEnabled() {
    return !(
      window.westlifeImage &&
      window.westlifeImage.enableViewer === false
    );
  }

  function hasViewableImages(context) {
    const root = context && context.nodeType === 1 ? context : document;
    return !!root.querySelector("[view-image] img");
  }

  function initViewImages() {
    if (!isViewerEnabled() || typeof window.ViewImage === "undefined") {
      return;
    }

    try {
      window.ViewImage.init("[view-image] img");
    } catch (e) {}
  }

  window.WestlifeViewImages = window.WestlifeViewImages || {
    init: initViewImages,
  };

  if (window.WestlifeApp && typeof window.WestlifeApp.register === "function") {
    window.WestlifeApp.register({
      name: "view-images",
      match(context) {
        return isViewerEnabled() && hasViewableImages(context);
      },
      init() {
        initViewImages();
      },
      destroy() {},
    });
  } else {
    document.addEventListener("DOMContentLoaded", initViewImages);
    document.addEventListener("westlife:ajax:content-replaced", initViewImages);
  }
})();
