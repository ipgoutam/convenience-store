
import { useLayoutEffect, useRef } from "react";
import {
  useLocation,
  useNavigationType,
} from "react-router-dom";

interface ScrollPosition {
  top: number;
  left: number;
}

function ScrollRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();

  const currentKey = useRef(location.key);
  const currentPath = useRef(location.pathname);

  currentPath.current = location.pathname;
  currentKey.current = location.key;

  // Save the current browser history entry's scroll position.
  useLayoutEffect(() => {
    const savePosition = () => {
      const position: ScrollPosition = {
        top: window.scrollY,
        left: window.scrollX,
      };

      sessionStorage.setItem(
        `gmart-scroll-${currentKey.current}`,
        JSON.stringify(position)
      );
    };

    window.addEventListener("scroll", savePosition, {
      passive: true,
    });

    return () => {
      savePosition();
      window.removeEventListener("scroll", savePosition);
    };
  }, []);

  // Restore scroll position when navigating between pages.
  useLayoutEffect(() => {
    window.history.scrollRestoration = "manual";

    let animationFrame = 0;
    let timeoutId: number | undefined;
    let observer: ResizeObserver | undefined;
    let cancelled = false;

    const restorePosition = (
      position: ScrollPosition,
      waitForContent: boolean
    ) => {
      const restore = (force = false) => {
        if (cancelled) return;

        const maxScroll = Math.max(
          0,
          document.documentElement.scrollHeight -
            window.innerHeight
        );

        if (maxScroll >= position.top || force) {
          window.scrollTo({
            top: Math.min(position.top, maxScroll),
            left: position.left,
            behavior: "instant",
          });

          observer?.disconnect();

          if (timeoutId !== undefined) {
            window.clearTimeout(timeoutId);
          }
        }
      };

      if (!waitForContent || position.top === 0) {
        restore(true);
        return;
      }

      observer = new ResizeObserver(() => restore());

      observer.observe(document.documentElement);

      animationFrame = window.requestAnimationFrame(() => {
        restore();
      });

      // Avoid waiting indefinitely for page content.
      timeoutId = window.setTimeout(() => {
        restore(true);
      }, 2000);
    };

    if (navigationType === "POP") {
      const savedPosition = sessionStorage.getItem(
        `gmart-scroll-${location.key}`
      );

      let position: ScrollPosition = {
        top: 0,
        left: 0,
      };

      try {
        if (savedPosition) {
          position = JSON.parse(savedPosition);
        }
      } catch {
        // Use the top of the page if saved data is invalid.
      }

      restorePosition(position, true);
    } else if (location.hash) {
      // Preserve navigation to page sections.
      animationFrame = window.requestAnimationFrame(() => {
        const element = document.getElementById(
          decodeURIComponent(location.hash.slice(1))
        );

        element?.scrollIntoView();
      });
    } else {
      // New page navigation starts at the top.
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: "instant",
      });
    }

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      observer?.disconnect();

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    location.key,
    location.hash,
    location.pathname,
    navigationType,
  ]);

  return null;
}

export default ScrollRestoration;
