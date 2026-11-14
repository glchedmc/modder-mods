package mc.glched.glasscompanion;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractSliderButton;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/**
 * In-game settings (Right Shift): category tabs across the top and a page of
 * toggles/sliders, the same features the launcher shows. Saved to
 * config/glass-companion.json, which the launcher reads back.
 */
public final class CompanionMenuScreen extends Screen {
	private static final String[] COLORS = {"#FFFFFF", "#7AA8FF", "#B28DFF", "#FF8FB1", "#FFB36B", "#5BE49B", "#FF5555", "#FFFF55"};
	private static int tab = 0;
	private final Screen parent;
	private int page = 0;

	public CompanionMenuScreen(Screen parent) {
		super(Component.literal("Glass Companion"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		List<CompanionConfig.Group> groups = CompanionConfig.groups();
		int tabW = Math.min(90, (width - 40) / Math.max(1, groups.size()));
		int tx = (width - tabW * groups.size()) / 2;
		for (int i = 0; i < groups.size(); i++) {
			final int idx = i;
			Button b = Button.builder(Component.literal(groups.get(i).label()), btn -> {
				tab = idx;
				page = 0;
				rebuildWidgets();
			}).bounds(tx + i * tabW, 32, tabW - 2, 20).build();
			b.active = i != tab;
			addRenderableWidget(b);
		}
		String groupId = groups.get(Math.min(tab, groups.size() - 1)).id();
		List<CompanionConfig.Feature> list = new ArrayList<>();
		for (CompanionConfig.Feature f : CompanionConfig.features()) {
			if (f.group().equals(groupId)) {
				list.add(f);
			}
		}
		int colW = 200;
		int cols = width >= 2 * colW + 30 ? 2 : 1;
		int rowsFit = Math.max(1, (height - 64 - 40) / 24);
		int perPage = rowsFit * cols;
		int pages = Math.max(1, (list.size() + perPage - 1) / perPage);
		page = Math.min(page, pages - 1);
		int startX = (width - (cols * colW + (cols - 1) * 10)) / 2;
		for (int i = page * perPage; i < Math.min(list.size(), (page + 1) * perPage); i++) {
			int local = i - page * perPage;
			int col = local / rowsFit;
			int row = local % rowsFit;
			addFeature(list.get(i), startX + col * (colW + 10), 64 + row * 24, colW);
		}
		int by = height - 28;
		if (pages > 1) {
			addRenderableWidget(Button.builder(Component.literal("<"), b -> {
				page = (page + pages - 1) % pages;
				rebuildWidgets();
			}).bounds(width / 2 - 130, by, 20, 20).build());
			addRenderableWidget(Button.builder(Component.literal(">"), b -> {
				page = (page + 1) % pages;
				rebuildWidgets();
			}).bounds(width / 2 + 110, by, 20, 20).build());
		}
		addRenderableWidget(Button.builder(Component.literal("Done"), b -> onClose()).bounds(width / 2 - 100, by, 200, 20).build());
	}

	private void addFeature(CompanionConfig.Feature f, int x, int y, int w) {
		switch (f.type()) {
			case "bool" -> addRenderableWidget(Button.builder(boolLabel(f), b -> {
				CompanionConfig.set(f.key(), !CompanionConfig.bool(f.key()));
				CompanionConfig.save();
				b.setMessage(boolLabel(f));
			}).bounds(x, y, w, 20).tooltip(f.hint().isEmpty() ? null : net.minecraft.client.gui.components.Tooltip.create(Component.literal(f.hint()))).build());
			case "number" -> addRenderableWidget(new FeatureSlider(f, x, y, w));
			case "color" -> addRenderableWidget(Button.builder(colorLabel(f), b -> {
				String cur = CompanionConfig.string(f.key()).toUpperCase(Locale.ROOT);
				int i = 0;
				while (i < COLORS.length && !COLORS[i].equals(cur)) {
					i++;
				}
				CompanionConfig.set(f.key(), COLORS[(i + 1) % COLORS.length]);
				CompanionConfig.save();
				b.setMessage(colorLabel(f));
			}).bounds(x, y, w, 20).build());
			default -> {
			}
		}
	}

	private static Component boolLabel(CompanionConfig.Feature f) {
		boolean on = CompanionConfig.bool(f.key());
		return Component.literal(f.label() + ": " + (on ? "§aOn" : "§7Off"));
	}

	private static Component colorLabel(CompanionConfig.Feature f) {
		String hex = CompanionConfig.string(f.key());
		return Component.literal(f.label() + ": ").append(Component.literal("■ " + hex).withColor(CompanionConfig.color(f.key()) & 0xFFFFFF));
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partial) {
		super.extractRenderState(g, mouseX, mouseY, partial);
		g.centeredText(font, title, width / 2, 14, 0xFFFFFFFF);
	}

	@Override
	public void onClose() {
		CompanionConfig.save();
		minecraft.gui.setScreen(parent);
	}

	private static final class FeatureSlider extends AbstractSliderButton {
		private final CompanionConfig.Feature f;

		FeatureSlider(CompanionConfig.Feature f, int x, int y, int w) {
			super(x, y, w, 20, Component.empty(), (CompanionConfig.num(f.key()) - f.min()) / (f.max() - f.min()));
			this.f = f;
			updateMessage();
		}

		private double current() {
			double raw = f.min() + value * (f.max() - f.min());
			return Math.round(raw / f.step()) * f.step();
		}

		@Override
		protected void updateMessage() {
			double v = current();
			setMessage(Component.literal(f.label() + ": " + (f.step() < 1 ? String.format(Locale.ROOT, "%.1f", v) : String.valueOf((int) v))));
		}

		@Override
		protected void applyValue() {
			CompanionConfig.set(f.key(), current());
			CompanionConfig.save();
		}
	}
}
