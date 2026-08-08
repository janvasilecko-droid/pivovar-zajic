package cz.minipivovar.zajic;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Zpracování sdíleného textu při spuštění aplikace
        handleIntent(getIntent());
    }
    
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        
        // Zpracování sdíleného textu při otevření aplikace z intentu
        handleIntent(intent);
    }
    
    private void handleIntent(Intent intent) {
        String action = intent.getAction();
        String type = intent.getType();
        
        // Zpracování ACTION_SEND s textem
        if (Intent.ACTION_SEND.equals(action) && type != null && type.equals("text/plain")) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (sharedText != null && !sharedText.trim().isEmpty()) {
                // Uložení sdíleného textu do WebView
                String jsCode = String.format(
                    "if (window.receiveSharedText) { window.receiveSharedText('%s'); }",
                    sharedText.replace("'", "\\'").replace("\n", "\\n")
                );
                getBridge().evaluateJavascript(jsCode, null);
            }
        }
    }
}
