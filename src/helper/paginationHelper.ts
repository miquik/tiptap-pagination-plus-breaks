// Helper functions for detecting when content is ready
export const waitForImages = (container: HTMLElement): Promise<void> => {
  const images = container.querySelectorAll("img");
  if (images.length === 0) {
    return Promise.resolve();
  }

  const imagePromises = Array.from(images).map((img) => {
    if (img.complete) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const onLoad = () => {
        img.removeEventListener("load", onLoad);
        img.removeEventListener("error", onLoad);
        resolve();
      };
      img.addEventListener("load", onLoad);
      img.addEventListener("error", onLoad);

      // Timeout after 5 seconds for broken images
      const timeoutId = setTimeout(onLoad, 5000);

      /*
      // Track cleanup for proper disposal
      this.storage.cleanups.push(() => {
        clearTimeout(timeoutId);
        img.removeEventListener("load", onLoad);
        img.removeEventListener("error", onLoad);
      });
      */
    });
  });

  return Promise.all(imagePromises).then(() => {});
};

export const waitForLayoutStable = (container: HTMLElement): Promise<void> => {
  return new Promise((resolve) => {
    let lastHeight = container.scrollHeight;
    let stableCount = 0;
    const requiredStableFrames = 3; // Need 3 consecutive stable frames

    const checkStability = () => {
      const currentHeight = container.scrollHeight;

      if (currentHeight === lastHeight) {
        stableCount++;
        if (stableCount >= requiredStableFrames) {
          resolve();
          return;
        }
      } else {
        stableCount = 0;
        lastHeight = currentHeight;
      }

      requestAnimationFrame(checkStability);
    };

    requestAnimationFrame(checkStability);
  });
};

export const waitForContentVisible = (
  container: HTMLElement
): Promise<void> => {
  return new Promise((resolve) => {
    // Use Intersection Observer to detect when content is visible
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && entry.intersectionRatio > 0) {
          observer.disconnect();
          resolve();
        }
      },
      { threshold: 0.01 }
    ); // Trigger when even 1% is visible

    observer.observe(container);

    // Fallback timeout
    const timeoutId = setTimeout(() => {
      observer.disconnect();
      resolve();
    }, 1000);

    /*
    // Track cleanup
    this.storage.cleanups.push(() => {
      clearTimeout(timeoutId);
      observer.disconnect();
    });
    */
  });
};

export const waiter = async (targetNode: HTMLElement) => {
  await Promise.all([
    // 1. Wait for fonts to load
    document.fonts.ready,

    // 2. Wait for images to load (if any)
    waitForImages(targetNode),

    // 3. Wait for content to be visible (layout complete)
    // waitForContentVisible(targetNode),

    // 4. Wait for layout to stabilize
    // waitForLayoutStable(targetNode),

    // 5. Wait for any pending async operations
    new Promise((resolve) => {
      if ("requestIdleCallback" in window) {
        requestIdleCallback(resolve, {
          timeout: 16,
        });
      } else {
        setTimeout(resolve, 16); // Fallback for older browsers
      }
    }),
  ]);
};
