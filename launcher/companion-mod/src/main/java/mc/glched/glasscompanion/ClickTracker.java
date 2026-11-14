package mc.glched.glasscompanion;

import java.util.ArrayDeque;

import net.minecraft.util.Util;

/** Records mouse presses (fed by MouseHandlerMixin) to compute clicks per second. */
public final class ClickTracker {
	private static final ArrayDeque<Long> LEFT = new ArrayDeque<>();
	private static final ArrayDeque<Long> RIGHT = new ArrayDeque<>();

	private ClickTracker() {
	}

	public static void press(int button) {
		long now = Util.getMillis();
		if (button == 0) {
			LEFT.addLast(now);
		} else if (button == 1) {
			RIGHT.addLast(now);
		}
	}

	private static int count(ArrayDeque<Long> q) {
		long cutoff = Util.getMillis() - 1000L;
		while (!q.isEmpty() && q.peekFirst() < cutoff) {
			q.pollFirst();
		}
		return q.size();
	}

	public static int left() {
		return count(LEFT);
	}

	public static int right() {
		return count(RIGHT);
	}
}
