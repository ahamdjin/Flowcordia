# Last-good snapshot recovery rule

The active workflow catalog is never cleared at synchronization start. Discovery and all exact content reads complete before the replacement transaction begins. Any failure before or during that transaction leaves the previous complete entries and observed commit available for authorized reads. A failed status communicates staleness without destroying usable evidence.
