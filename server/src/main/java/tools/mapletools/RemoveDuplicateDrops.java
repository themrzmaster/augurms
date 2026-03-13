package tools.mapletools;

import java.io.PrintWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * This tool takes the large drop-data.sql file as input, and removes all duplicate drops.
 * A drop is considered to be a duplicate if it has the same dropperid/mobid & itemid as another drop.
 * The first drop encountered in the input is kept, and any subsequent duplicates are removed.
 * <p>
 * Note about duplicate drops: duplicate drops are supposed to exist.
 * For example, Zakum should be able to drop multiple Zakum helmets. This is vanilla MapleStory behavior.
 * <p>
 * This tool is mostly useful during the migration from the old scripts to the new scripts in Liquibase,
 * since the old scripts relied on a combination of unique database constraint on mobid+itemid
 * and the INSERT IGNORE feature of MySQL to prevent duplicates. The INSERT IGNORE would attempt to insert the drop,
 * and if there was a duplicate it would fail and thereby be skipped.
 * In the new scripts, the unique constraint has been removed (because duplicate drops should be allowed),
 * so all the (previously ignored) inserts would succeed, and we end up with a bunch of duplicates.
 *
 * @author Ponk
 */
public class RemoveDuplicateDrops {
    // Precondition: copy from src/main/resources/db/(...)drop-data.sql to tools/input/drop-data.sql
    private static final Path DROP_DATA_INPUT_FILE = ToolConstants.getInputFile("drop-data.sql");
    private static final Path DROP_DATA_OUTPUT_FILE = ToolConstants.getOutputFile("drop-data_no-duplicates.sql");
    private static final Path REMOVED_LINES_OUTPUT_FILE = ToolConstants.getOutputFile("drop-data_removed-lines.sql");
    private static final Pattern INSERT_VALUE_PATTERN = Pattern.compile(".*\\((?<mob>\\d+), (?<item>\\d+), \\d+, \\d+, \\d+, \\d+\\).*");

    private record DropIdentifier(int mobId, int itemId) {
    }

    private record ProcessingResult(List<String> retainedLines, List<String> removedLines) {
    }

    public static void main(String[] args) {
        Instant start = Instant.now();

        System.out.printf("Reading %s%n", DROP_DATA_INPUT_FILE);
        List<String> lines = readDropDataLines();
        System.out.printf("Read %d lines%n", lines.size());

        System.out.println("Removing duplicate drops...");
        ProcessingResult processingResult = removeDuplicateDrops(lines);
        System.out.printf("Removed %d lines%n", processingResult.removedLines.size());

        System.out.println("Writing output to " + DROP_DATA_OUTPUT_FILE);
        writeDropDataOutput(processingResult.retainedLines);
        System.out.println("Writing removed lines to " + REMOVED_LINES_OUTPUT_FILE);
        writeRemovedLinesOutput(processingResult.removedLines);

        Duration totalDuration = Duration.between(start, Instant.now());
        System.out.printf("Done! Total elapsed time: %d%n", totalDuration.toMillis());
    }

    private static List<String> readDropDataLines() {
        try {
            return Files.readAllLines(DROP_DATA_INPUT_FILE);
        } catch (Exception e) {
            throw new RuntimeException("Failed to read input file", e);
        }
    }

    private static ProcessingResult removeDuplicateDrops(List<String> lines) {
        Set<DropIdentifier> encounteredDrops = new HashSet<>();
        List<String> retainedLines = new ArrayList<>();
        List<String> removedLines = new ArrayList<>();
        for (String line : lines) {
            Optional<DropIdentifier> optDropIdentifier = parseDropIdentifier(line);
            if (optDropIdentifier.isEmpty()) {
                retainedLines.add(line);
                continue;
            }

            DropIdentifier dropIdentifier = optDropIdentifier.get();
            if (encounteredDrops.contains(dropIdentifier)) {
                removedLines.add(line);
            } else {
                encounteredDrops.add(dropIdentifier);
                retainedLines.add(line);
            }
        }

        return new ProcessingResult(retainedLines, removedLines);
    }

    private static Optional<DropIdentifier> parseDropIdentifier(String line) {
        Matcher matcher = INSERT_VALUE_PATTERN.matcher(line);
        if (!matcher.matches()) {
            return Optional.empty();
        }
        int mobId = Integer.parseInt(matcher.group("mob"));
        int itemId = Integer.parseInt(matcher.group("item"));
        return Optional.of(new DropIdentifier(mobId, itemId));
    }

    private static void writeDropDataOutput(List<String> retainedLines) {
        try (PrintWriter pw = new PrintWriter(Files.newOutputStream(DROP_DATA_OUTPUT_FILE))) {
            retainedLines.forEach(pw::println);
        } catch (Exception e) {
            throw new RuntimeException("Failed to write drop data output file", e);
        }
    }

    private static void writeRemovedLinesOutput(List<String> removedLines) {
        try (PrintWriter pw = new PrintWriter(Files.newOutputStream(REMOVED_LINES_OUTPUT_FILE))) {
            removedLines.forEach(pw::println);
        } catch (Exception e) {
            throw new RuntimeException("Failed to write removed lines output file", e);
        }
    }
}
